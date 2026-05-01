import { app } from 'electron';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { fileURLToPath } from 'node:url';
import { openDatabase, type DB } from './connection.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

let cached: DB | null = null;

function resolveSeedPath(): string {
  if (is.dev) {
    return join(__dirname, '../../resources/seed.db');
  }
  return join(process.resourcesPath, 'seed.db');
}

function resolveUserDbPath(): string {
  return join(app.getPath('userData'), 'app.db');
}

export function getDb(): DB {
  if (cached) return cached;
  const target = resolveUserDbPath();
  if (!existsSync(target)) {
    const seed = resolveSeedPath();
    if (!existsSync(seed)) {
      throw new Error(`seed database not found at ${seed} — run "npm run seed" first.`);
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(seed, target);
    console.log(`[db] copied seed → ${target}`);
  }
  cached = openDatabase(target);
  return cached;
}

export function closeDb(): void {
  if (cached) {
    cached.close();
    cached = null;
  }
}
