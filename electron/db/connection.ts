import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema.js';
import { runMigrations } from './migrations.js';

export type DB = Database.Database;

export function openDatabase(path: string, seedPath?: string): DB {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  runMigrations(db, seedPath);
  return db;
}
