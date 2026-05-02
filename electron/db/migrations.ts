import { existsSync } from 'node:fs';
import type { DB } from './connection.js';

export function runMigrations(db: DB, seedPath?: string): void {
  const cols = (
    db.prepare('PRAGMA table_info(plan_system_status)').all() as { name: string }[]
  ).map((r) => r.name);

  if (!cols.includes('transfer_amount')) {
    db.exec('ALTER TABLE plan_system_status ADD COLUMN transfer_amount INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.includes('destination_system_id')) {
    db.exec('ALTER TABLE plan_system_status ADD COLUMN destination_system_id INTEGER');
  }
  if (!cols.includes('export_all_unused')) {
    db.exec('ALTER TABLE plan_system_status ADD COLUMN export_all_unused INTEGER NOT NULL DEFAULT 0');
  }

  const upgradeCols = (
    db.prepare('PRAGMA table_info(plan_upgrades)').all() as { name: string }[]
  ).map((r) => r.name);
  if (!upgradeCols.includes('installed')) {
    db.exec('ALTER TABLE plan_upgrades ADD COLUMN installed INTEGER NOT NULL DEFAULT 0');
  }

  const systemCols = (
    db.prepare('PRAGMA table_info(systems)').all() as { name: string }[]
  ).map((r) => r.name);
  if (!systemCols.includes('x')) {
    db.exec('ALTER TABLE systems ADD COLUMN x REAL DEFAULT NULL');
  }
  if (!systemCols.includes('y')) {
    db.exec('ALTER TABLE systems ADD COLUMN y REAL DEFAULT NULL');
  }
  if (!systemCols.includes('z')) {
    db.exec('ALTER TABLE systems ADD COLUMN z REAL DEFAULT NULL');
  }

  db.exec(`CREATE TABLE IF NOT EXISTS plan_aln_links (
    plan_id             INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    system_id           INTEGER NOT NULL REFERENCES systems(id),
    linked_system_id    INTEGER,
    linked_system_name  TEXT    NOT NULL,
    PRIMARY KEY (plan_id, system_id)
  )`);

  // Populate system_adjacency from seed.db if this user DB has none (e.g. copied before
  // stargates were seeded). Uses ATTACH so no JSONL re-import is needed at runtime.
  const adjCount = (db.prepare('SELECT COUNT(*) AS n FROM system_adjacency').get() as { n: number }).n;
  if (adjCount === 0 && seedPath && existsSync(seedPath)) {
    db.exec(`ATTACH DATABASE '${seedPath.replace(/'/g, "''")}' AS seed`);
    try {
      db.prepare('INSERT OR IGNORE INTO system_adjacency SELECT system_id, neighbor_id FROM seed.system_adjacency').run();
    } finally {
      db.exec('DETACH DATABASE seed');
    }
  }

  const regionCols = (
    db.prepare('PRAGMA table_info(regions)').all() as { name: string }[]
  ).map((r) => r.name);
  if (!regionCols.includes('map_svg')) {
    db.exec('ALTER TABLE regions ADD COLUMN map_svg TEXT');
  }

  // Backfill map_svg from seed.db if this user DB has regions with NULL map_svg.
  const missingMapSvg = (db.prepare('SELECT COUNT(*) AS n FROM regions WHERE map_svg IS NULL').get() as { n: number }).n;
  if (missingMapSvg > 0 && seedPath && existsSync(seedPath)) {
    db.exec(`ATTACH DATABASE '${seedPath.replace(/'/g, "''")}' AS seed`);
    try {
      db.prepare('UPDATE regions SET map_svg = (SELECT map_svg FROM seed.regions sr WHERE sr.id = regions.id) WHERE map_svg IS NULL').run();
    } finally {
      db.exec('DETACH DATABASE seed');
    }
  }

  // Backfill x/y/z coordinates from seed.db if this user DB has systems with NULL coords.
  const missingCoords = (db.prepare('SELECT COUNT(*) AS n FROM systems WHERE x IS NULL').get() as { n: number }).n;
  if (missingCoords > 0 && seedPath && existsSync(seedPath)) {
    db.exec(`ATTACH DATABASE '${seedPath.replace(/'/g, "''")}' AS seed`);
    try {
      db.prepare('UPDATE systems SET x = (SELECT x FROM seed.systems s WHERE s.id = systems.id), y = (SELECT y FROM seed.systems s WHERE s.id = systems.id), z = (SELECT z FROM seed.systems s WHERE s.id = systems.id) WHERE x IS NULL').run();
    } finally {
      db.exec('DETACH DATABASE seed');
    }
  }
}
