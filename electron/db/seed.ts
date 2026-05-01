import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { openDatabase } from './connection.js';
import { importSde } from '../sde/importer.js';
import { importStarsCsv, importPlanetsCsv, importUpgradesCsv } from '../csv/importer.js';
import type { ImportReport } from '@shared/index';

const ROOT = process.cwd();

interface Args {
  data: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    data: ROOT,
    out: resolve(ROOT, 'resources/seed.db')
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--data' && argv[i + 1]) args.data = resolve(argv[++i]);
    else if (a === '--out' && argv[i + 1]) args.out = resolve(argv[++i]);
  }
  return args;
}

function mergeReports(parts: ImportReport[]): ImportReport {
  const counts: ImportReport['counts'] = {};
  const warnings: ImportReport['warnings'] = [];
  for (const p of parts) {
    for (const [k, v] of Object.entries(p.counts)) {
      counts[k as keyof typeof counts] = (counts[k as keyof typeof counts] ?? 0) + (v ?? 0);
    }
    warnings.push(...p.warnings);
  }
  return { counts, warnings };
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`[seed] data=${args.data}`);
  console.log(`[seed] out=${args.out}`);

  mkdirSync(dirname(args.out), { recursive: true });
  if (existsSync(args.out)) rmSync(args.out);

  const sdePaths = {
    regions: resolve(args.data, 'mapRegions.jsonl'),
    constellations: resolve(args.data, 'mapConstellations.jsonl'),
    solarSystems: resolve(args.data, 'mapSolarSystems.jsonl'),
    stars: resolve(args.data, 'mapStars.jsonl')
  };
  const csvPaths = {
    stars: resolve(args.data, 'stars.csv'),
    planets: resolve(args.data, 'planets.csv'),
    upgrades: resolve(args.data, 'sovUpgardes.csv')
  };

  for (const p of [...Object.values(sdePaths), ...Object.values(csvPaths)]) {
    if (!existsSync(p)) {
      console.error(`[seed] missing source file: ${p}`);
      process.exit(1);
    }
  }

  const db = openDatabase(args.out);
  try {
    console.log('[seed] importing SDE…');
    const sdeStart = Date.now();
    const { report: sdeReport, maps } = await importSde(db, sdePaths);
    console.log(`[seed] SDE done in ${Date.now() - sdeStart}ms`);

    console.log('[seed] importing stars.csv…');
    const starsReport = await importStarsCsv(db, csvPaths.stars, maps);

    console.log('[seed] importing planets.csv…');
    const planetsReport = await importPlanetsCsv(db, csvPaths.planets, maps);

    console.log('[seed] importing sovUpgardes.csv…');
    const upgradesReport = await importUpgradesCsv(db, csvPaths.upgrades);

    const merged = mergeReports([sdeReport, starsReport, planetsReport, upgradesReport]);

    console.log('[seed] counts:', merged.counts);
    if (merged.warnings.length) {
      console.log(`[seed] ${merged.warnings.length} warning(s):`);
      const sample = merged.warnings.slice(0, 20);
      for (const w of sample) console.log(`  ${w.file}:${w.row}  ${w.message}`);
      if (merged.warnings.length > sample.length) {
        console.log(`  …and ${merged.warnings.length - sample.length} more`);
      }
    } else {
      console.log('[seed] no warnings.');
    }
  } finally {
    db.close();
  }
  console.log(`[seed] wrote ${args.out}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
