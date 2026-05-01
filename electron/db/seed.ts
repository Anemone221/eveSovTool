import type { ImportReport } from "@shared/index";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import https from "node:https";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";
import {
    importPlanetsCsv,
    importStarsCsv,
    importUpgradesCsv,
} from "../csv/importer.js";
import { importSde, importStargates } from "../sde/importer.js";
import { openDatabase } from "./connection.js";

const ROOT = process.cwd();
const SDE_ZIP_URL =
    "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip";

// Filenames within the zip that we need (matched by basename)
const SDE_FILES = [
    "mapRegions.jsonl",
    "mapConstellations.jsonl",
    "mapSolarSystems.jsonl",
    "mapStars.jsonl",
    "mapStargates.jsonl",
];

interface Args {
    data: string;
    out: string;
}

function parseArgs(argv: string[]): Args {
    const args: Args = {
        data: ROOT,
        out: resolve(ROOT, "resources/seed.db"),
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--data" && argv[i + 1]) args.data = resolve(argv[++i]);
        else if (a === "--out" && argv[i + 1]) args.out = resolve(argv[++i]);
    }
    return args;
}

function mergeReports(parts: ImportReport[]): ImportReport {
    const counts: ImportReport["counts"] = {};
    const warnings: ImportReport["warnings"] = [];
    for (const p of parts) {
        for (const [k, v] of Object.entries(p.counts)) {
            counts[k as keyof typeof counts] =
                (counts[k as keyof typeof counts] ?? 0) + (v ?? 0);
        }
        warnings.push(...p.warnings);
    }
    return { counts, warnings };
}

function downloadToBuffer(url: string): Promise<Buffer> {
    return new Promise((resolveP, rejectP) => {
        const follow = (target: string, redirects: number) => {
            if (redirects > 5) {
                rejectP(new Error("Too many redirects"));
                return;
            }
            https
                .get(target, (res) => {
                    if (
                        res.statusCode &&
                        res.statusCode >= 300 &&
                        res.statusCode < 400 &&
                        res.headers.location
                    ) {
                        follow(res.headers.location, redirects + 1);
                        res.resume();
                        return;
                    }
                    if (res.statusCode !== 200) {
                        rejectP(
                            new Error(`HTTP ${res.statusCode} from ${target}`),
                        );
                        res.resume();
                        return;
                    }
                    const chunks: Buffer[] = [];
                    res.on("data", (chunk: Buffer) => chunks.push(chunk));
                    res.on("end", () => resolveP(Buffer.concat(chunks)));
                    res.on("error", rejectP);
                })
                .on("error", rejectP);
        };
        follow(url, 0);
    });
}

// Parse a zip buffer and extract entries whose basename matches wantedFiles.
// Writes matched entries to destDir. Returns a map of basename -> extracted path.
// Supports compression methods 0 (stored) and 8 (deflate).
function extractFromZip(
    zipBuf: Buffer,
    destDir: string,
    wantedFiles: string[],
): Map<string, string> {
    const wanted = new Set(wantedFiles);
    const found = new Map<string, string>();
    let offset = 0;

    while (offset + 30 <= zipBuf.length) {
        const sig = zipBuf.readUInt32LE(offset);
        // Central directory or end-of-central-directory — we're done scanning local headers.
        if (sig === 0x02014b50 || sig === 0x06054b50) break;
        // Skip anything that isn't a local file header.
        if (sig !== 0x04034b50) {
            offset++;
            continue;
        }

        const compression = zipBuf.readUInt16LE(offset + 8);
        const compressedSize = zipBuf.readUInt32LE(offset + 18);
        const fileNameLen = zipBuf.readUInt16LE(offset + 26);
        const extraLen = zipBuf.readUInt16LE(offset + 28);
        const fileName = zipBuf
            .subarray(offset + 30, offset + 30 + fileNameLen)
            .toString("utf8");
        const dataOffset = offset + 30 + fileNameLen + extraLen;

        const base = fileName.split("/").pop()!;
        if (base && wanted.has(base)) {
            const compressed = zipBuf.subarray(
                dataOffset,
                dataOffset + compressedSize,
            );
            const data =
                compression === 0 ? compressed : inflateRawSync(compressed);
            const dest = join(destDir, base);
            writeFileSync(dest, data);
            found.set(base, dest);
        }

        offset = dataOffset + compressedSize;
    }

    for (const name of wantedFiles) {
        if (!found.has(name)) {
            throw new Error(
                `[seed] SDE zip did not contain expected file: ${name}`,
            );
        }
    }
    return found;
}

async function downloadSde(tmpDir: string): Promise<Map<string, string>> {
    console.log(`[seed] downloading SDE from ${SDE_ZIP_URL} ...`);
    const start = Date.now();
    const buf = await downloadToBuffer(SDE_ZIP_URL);
    console.log(
        `[seed] download complete (${(buf.length / 1024 / 1024).toFixed(1)} MB in ${Date.now() - start}ms)`,
    );

    console.log("[seed] extracting SDE files...");
    const extractStart = Date.now();
    const files = extractFromZip(buf, tmpDir, SDE_FILES);
    console.log(`[seed] extraction done in ${Date.now() - extractStart}ms`);
    return files;
}

async function main() {
    const args = parseArgs(process.argv);
    console.log(`[seed] data=${args.data}`);
    console.log(`[seed] out=${args.out}`);

    mkdirSync(dirname(args.out), { recursive: true });
    if (existsSync(args.out)) rmSync(args.out);

    const tmpDir = join(tmpdir(), `evesov-sde-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    let sdeFiles: Map<string, string>;
    try {
        sdeFiles = await downloadSde(tmpDir);
    } catch (err) {
        rmSync(tmpDir, { recursive: true, force: true });
        throw err;
    }

    const sdePaths = {
        regions: sdeFiles.get("mapRegions.jsonl")!,
        constellations: sdeFiles.get("mapConstellations.jsonl")!,
        solarSystems: sdeFiles.get("mapSolarSystems.jsonl")!,
        stars: sdeFiles.get("mapStars.jsonl")!,
    };

    const csvPaths = {
        stars: resolve(args.data, "outside_Resources/Sov_Resources/stars.csv"),
        planets: resolve(
            args.data,
            "outside_Resources/Sov_Resources/planets.csv",
        ),
        upgrades: resolve(
            args.data,
            "outside_Resources/Sov_Resources/sovUpgardes.csv",
        ),
    };

    for (const p of Object.values(csvPaths)) {
        if (!existsSync(p)) {
            rmSync(tmpDir, { recursive: true, force: true });
            console.error(`[seed] missing source file: ${p}`);
            process.exit(1);
        }
    }

    const db = openDatabase(args.out);
    try {
        console.log("[seed] importing SDE...");
        const sdeStart = Date.now();
        const { report: sdeReport, maps } = await importSde(db, sdePaths);
        console.log(`[seed] SDE done in ${Date.now() - sdeStart}ms`);

        console.log("[seed] importing stars.csv...");
        const starsReport = await importStarsCsv(db, csvPaths.stars, maps);

        console.log("[seed] importing planets.csv...");
        const planetsReport = await importPlanetsCsv(
            db,
            csvPaths.planets,
            maps,
        );

        console.log("[seed] importing sovUpgardes.csv...");
        const upgradesReport = await importUpgradesCsv(db, csvPaths.upgrades);

        console.log("[seed] importing mapStargates.jsonl...");
        const stargatesReport = await importStargates(db, sdeFiles.get("mapStargates.jsonl")!);

        const merged = mergeReports([
            sdeReport,
            starsReport,
            planetsReport,
            upgradesReport,
            stargatesReport,
        ]);

        console.log("[seed] counts:", merged.counts);
        if (merged.warnings.length) {
            console.log(`[seed] ${merged.warnings.length} warning(s):`);
            const sample = merged.warnings.slice(0, 20);
            for (const w of sample)
                console.log(`  ${w.file}:${w.row}  ${w.message}`);
            if (merged.warnings.length > sample.length) {
                console.log(
                    `  ...and ${merged.warnings.length - sample.length} more`,
                );
            }
        } else {
            console.log("[seed] no warnings.");
        }
    } finally {
        db.close();
        rmSync(tmpDir, { recursive: true, force: true });
    }
    console.log(`[seed] wrote ${args.out}`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
