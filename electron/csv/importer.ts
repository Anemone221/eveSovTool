import { readFile } from 'node:fs/promises';
import Papa from 'papaparse';
import type { DB } from '../db/connection.js';
import type { ImportReport, ImportWarning } from '@shared/index';
import type { SdeMaps } from '../sde/importer.js';

interface StarsCsvRow {
  starID: string;
  regionName: string;
  'System Name': string;
  Star: string;
  power: string;
}

interface PlanetsCsvRow {
  planetID: string;
  'Region Name': string;
  'System Name': string;
  'Planet Name': string;
  Power: string;
  Workforce: string;
  'Superionic Ice / Hour': string;
  'Magmatic Gas / Hour': string;
}

interface UpgradesCsvRow {
  Upgrade: string;
  Power: string;
  Workforce: string;
  'Superionic Ice': string;
  'Magmatic Gas': string;
  Startup: string;
}

async function parseCsv<T>(path: string): Promise<T[]> {
  const text = await readFile(path, 'utf8');
  const result = Papa.parse<T>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim()
  });
  return result.data;
}

function num(value: string | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function importStarsCsv(
  db: DB,
  path: string,
  maps: Pick<SdeMaps, 'starToSystem' | 'starSpectralClass'>
): Promise<ImportReport> {
  const rows = await parseCsv<StarsCsvRow>(path);
  const warnings: ImportWarning[] = [];

  const lookupRegionName = db.prepare(
    `SELECT r.name AS region, s.name AS system
       FROM systems s JOIN regions r ON r.id = s.region_id WHERE s.id = ?`
  );
  const upsert = db.prepare(
    `INSERT INTO stars (id, system_id, spectral_class, description, power)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       system_id      = excluded.system_id,
       spectral_class = excluded.spectral_class,
       description    = excluded.description,
       power          = excluded.power`
  );

  let imported = 0;

  const txn = db.transaction(() => {
    db.prepare('DELETE FROM stars').run();
    rows.forEach((row, idx) => {
      const lineNo = idx + 2;
      const starId = Number(row.starID);
      if (!Number.isFinite(starId)) {
        warnings.push({ source: 'csv', file: path, row: lineNo, message: `invalid starID: ${row.starID}` });
        return;
      }
      const systemId = maps.starToSystem.get(starId);
      if (!systemId) {
        warnings.push({ source: 'csv', file: path, row: lineNo, message: `starID ${starId} not in SDE` });
        return;
      }
      const sde = lookupRegionName.get(systemId) as { region: string; system: string } | undefined;
      if (sde) {
        if (sde.region !== row.regionName) {
          warnings.push({
            source: 'csv',
            file: path,
            row: lineNo,
            message: `region mismatch for star ${starId}: csv="${row.regionName}" sde="${sde.region}"`
          });
        }
        if (sde.system !== row['System Name']) {
          warnings.push({
            source: 'csv',
            file: path,
            row: lineNo,
            message: `system name mismatch for star ${starId}: csv="${row['System Name']}" sde="${sde.system}"`
          });
        }
      }
      upsert.run(
        starId,
        systemId,
        maps.starSpectralClass.get(starId) ?? null,
        row.Star,
        Math.trunc(num(row.power))
      );
      imported++;
    });
  });
  txn();

  return { counts: { stars: imported }, warnings };
}

export async function importPlanetsCsv(
  db: DB,
  path: string,
  maps: Pick<SdeMaps, 'planetToSystem'>
): Promise<ImportReport> {
  const rows = await parseCsv<PlanetsCsvRow>(path);
  const warnings: ImportWarning[] = [];

  const lookupRegionName = db.prepare(
    `SELECT r.name AS region, s.name AS system
       FROM systems s JOIN regions r ON r.id = s.region_id WHERE s.id = ?`
  );
  const upsert = db.prepare(
    `INSERT INTO planets
       (id, system_id, name, power, workforce, superionic_ice_per_hour, magmatic_gas_per_hour)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       system_id                = excluded.system_id,
       name                     = excluded.name,
       power                    = excluded.power,
       workforce                = excluded.workforce,
       superionic_ice_per_hour  = excluded.superionic_ice_per_hour,
       magmatic_gas_per_hour    = excluded.magmatic_gas_per_hour`
  );

  let imported = 0;

  const txn = db.transaction(() => {
    db.prepare('DELETE FROM planets').run();
    rows.forEach((row, idx) => {
      const lineNo = idx + 2;
      const planetId = Number(row.planetID);
      if (!Number.isFinite(planetId)) {
        warnings.push({ source: 'csv', file: path, row: lineNo, message: `invalid planetID: ${row.planetID}` });
        return;
      }
      const systemId = maps.planetToSystem.get(planetId);
      if (!systemId) {
        warnings.push({ source: 'csv', file: path, row: lineNo, message: `planetID ${planetId} not in SDE` });
        return;
      }
      const sde = lookupRegionName.get(systemId) as { region: string; system: string } | undefined;
      if (sde) {
        if (sde.region !== row['Region Name']) {
          warnings.push({
            source: 'csv',
            file: path,
            row: lineNo,
            message: `region mismatch for planet ${planetId}: csv="${row['Region Name']}" sde="${sde.region}"`
          });
        }
        if (sde.system !== row['System Name']) {
          warnings.push({
            source: 'csv',
            file: path,
            row: lineNo,
            message: `system mismatch for planet ${planetId}: csv="${row['System Name']}" sde="${sde.system}"`
          });
        }
      }
      upsert.run(
        planetId,
        systemId,
        row['Planet Name'],
        Math.trunc(num(row.Power)),
        Math.trunc(num(row.Workforce)),
        Math.trunc(num(row['Superionic Ice / Hour'])),
        Math.trunc(num(row['Magmatic Gas / Hour']))
      );
      imported++;
    });
  });
  txn();

  return { counts: { planets: imported }, warnings };
}

export async function importUpgradesCsv(db: DB, path: string): Promise<ImportReport> {
  const rows = await parseCsv<UpgradesCsvRow>(path);
  const warnings: ImportWarning[] = [];

  const upsert = db.prepare(
    `INSERT INTO upgrades (name, power, workforce, superionic_ice, magmatic_gas, startup)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       power           = excluded.power,
       workforce       = excluded.workforce,
       superionic_ice  = excluded.superionic_ice,
       magmatic_gas    = excluded.magmatic_gas,
       startup         = excluded.startup`
  );

  let imported = 0;

  const txn = db.transaction(() => {
    db.prepare('DELETE FROM upgrades').run();
    rows.forEach((row, idx) => {
      const lineNo = idx + 2;
      const name = (row.Upgrade ?? '').trim();
      if (!name) return;
      try {
        upsert.run(
          name,
          Math.trunc(num(row.Power)),
          Math.trunc(num(row.Workforce)),
          Math.trunc(num(row['Superionic Ice'])),
          Math.trunc(num(row['Magmatic Gas'])),
          Math.trunc(num(row.Startup))
        );
        imported++;
      } catch (err) {
        warnings.push({ source: 'csv', file: path, row: lineNo, message: String(err) });
      }
    });
  });
  txn();

  return { counts: { upgrades: imported }, warnings };
}
