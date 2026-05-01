import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { DB } from '../db/connection.js';
import type { ImportReport, ImportWarning } from '@shared/index';

export interface SdePaths {
  regions: string;
  constellations: string;
  solarSystems: string;
  stars: string;
}

export interface SdeMaps {
  planetToSystem: Map<number, number>;
  starToSystem: Map<number, number>;
  starSpectralClass: Map<number, string | null>;
}

interface RegionRow {
  _key: number;
  factionID?: number;
  name: { en: string };
}

interface ConstellationRow {
  _key: number;
  regionID: number;
  factionID?: number;
  name: { en: string };
}

interface SolarSystemRow {
  _key: number;
  constellationID: number;
  regionID: number;
  name: { en: string };
  securityStatus?: number;
  securityClass?: string;
  starID?: number;
  planetIDs?: number[];
}

interface StarRow {
  _key: number;
  solarSystemID: number;
  statistics?: { spectralClass?: string };
}

interface StargateRow {
  _key: number;
  solarSystemID: number;
  destination: {
    solarSystemID: number;
    stargateID: number;
  };
}

async function readJsonl<T>(path: string): Promise<Array<{ row: T; lineNo: number }>> {
  const out: Array<{ row: T; lineNo: number }> = [];
  const stream = createReadStream(path, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push({ row: JSON.parse(trimmed) as T, lineNo });
  }
  return out;
}

export async function importSde(db: DB, paths: SdePaths): Promise<{ report: ImportReport; maps: SdeMaps }> {
  const warnings: ImportWarning[] = [];
  const counts = { regions: 0, constellations: 0, systems: 0, stars: 0 };

  const regions = await readJsonl<RegionRow>(paths.regions);
  const constellations = await readJsonl<ConstellationRow>(paths.constellations);
  const solarSystems = await readJsonl<SolarSystemRow>(paths.solarSystems);
  const stars = await readJsonl<StarRow>(paths.stars);

  const planetToSystem = new Map<number, number>();
  const starToSystem = new Map<number, number>();
  const starSpectralClass = new Map<number, string | null>();

  const insertRegion = db.prepare(
    'INSERT OR REPLACE INTO regions (id, name, faction_id) VALUES (?, ?, ?)'
  );
  const insertConstellation = db.prepare(
    'INSERT OR REPLACE INTO constellations (id, region_id, name, faction_id) VALUES (?, ?, ?, ?)'
  );
  const insertSystem = db.prepare(
    `INSERT OR REPLACE INTO systems
       (id, constellation_id, region_id, name, security_status, security_class)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const txn = db.transaction(() => {
    for (const { row, lineNo } of regions) {
      try {
        insertRegion.run(row._key, row.name.en, row.factionID ?? null);
        counts.regions++;
      } catch (err) {
        warnings.push({ source: 'sde', file: paths.regions, row: lineNo, message: String(err) });
      }
    }
    for (const { row, lineNo } of constellations) {
      try {
        insertConstellation.run(row._key, row.regionID, row.name.en, row.factionID ?? null);
        counts.constellations++;
      } catch (err) {
        warnings.push({ source: 'sde', file: paths.constellations, row: lineNo, message: String(err) });
      }
    }
    for (const { row, lineNo } of solarSystems) {
      try {
        insertSystem.run(
          row._key,
          row.constellationID,
          row.regionID,
          row.name.en,
          row.securityStatus ?? null,
          row.securityClass ?? null
        );
        counts.systems++;
        if (row.starID) starToSystem.set(row.starID, row._key);
        if (row.planetIDs) {
          for (const planetId of row.planetIDs) planetToSystem.set(planetId, row._key);
        }
      } catch (err) {
        warnings.push({ source: 'sde', file: paths.solarSystems, row: lineNo, message: String(err) });
      }
    }
    for (const { row } of stars) {
      starSpectralClass.set(row._key, row.statistics?.spectralClass ?? null);
      counts.stars++;
    }
  });

  txn();

  return {
    report: { counts, warnings },
    maps: { planetToSystem, starToSystem, starSpectralClass }
  };
}

export async function importStargates(db: DB, path: string): Promise<ImportReport> {
  const rows = await readJsonl<StargateRow>(path);
  const warnings: ImportWarning[] = [];

  const knownSystems = new Set<number>(
    (db.prepare('SELECT id FROM systems').all() as { id: number }[]).map((r) => r.id)
  );

  const insert = db.prepare(
    'INSERT OR IGNORE INTO system_adjacency (system_id, neighbor_id) VALUES (?, ?)'
  );

  let imported = 0;

  db.transaction(() => {
    db.prepare('DELETE FROM system_adjacency').run();
    for (const { row, lineNo } of rows) {
      const src = row.solarSystemID;
      const dst = row.destination.solarSystemID;
      if (!knownSystems.has(src) || !knownSystems.has(dst)) {
        warnings.push({
          source: 'sde',
          file: path,
          row: lineNo,
          message: `skipping stargate ${row._key}: system ${src} or ${dst} not in DB`,
        });
        continue;
      }
      insert.run(src, dst);
      insert.run(dst, src);
      imported++;
    }
  })();

  return { counts: { stargates: imported }, warnings };
}
