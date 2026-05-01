import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema.js';

export type DB = Database.Database;

export function openDatabase(path: string): DB {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}
