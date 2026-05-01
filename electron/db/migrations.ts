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
}
