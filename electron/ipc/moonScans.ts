import { ipcMain } from 'electron';
import { getDb } from '../db/userDb.js';
import type { MoonScan, MoonScanSession } from '@shared/index';

// Maps ore type name prefix → R-tier. EVE ore names include variants like
// "Glistening Carnotite" — the base name is matched by checking if the
// ore name contains one of these keys (case-insensitive).
const ORE_TIERS: [string, 4 | 8 | 16 | 32 | 64][] = [
  // R4
  ['Zeolites', 4],
  ['Bitumens', 4],
  ['Sylvite', 4],
  ['Coesite', 4],
  // R8
  ['Scheelite', 8],
  ['Titanite', 8],
  ['Cobaltite', 8],
  ['Euxenite', 8],
  // R16
  ['Sperrylite', 16],
  ['Chromite', 16],
  ['Otavite', 16],
  ['Vanadinite', 16],
  // R32
  ['Carnotite', 32],
  ['Zircon', 32],
  ['Pollucite', 32],
  ['Cinnabar', 32],
  // R64
  ['Monazite', 64],
  ['Loparite', 64],
  ['Xenotime', 64],
  ['Ytterbite', 64],
];

export function oreRTier(oreType: string): 4 | 8 | 16 | 32 | 64 | null {
  const lower = oreType.toLowerCase();
  for (const [name, tier] of ORE_TIERS) {
    if (lower.includes(name.toLowerCase())) return tier;
  }
  return null;
}

// Parse EVE moon survey clipboard text.
//
// Actual format (confirmed from in-game clipboard):
//   Header row (tab-separated, starts with "Moon"):
//     Moon\tMoon Product\tQuantity\tOre TypeID\tSolarSystemID\tPlanetID\tMoonID
//   Moon label row (no leading tab):
//     7-K5EL II - Moon 1
//   Ore rows (leading tab, then tab-separated fields):
//     \tBitumens\t0.298183143139\t45492\t30000224\t40014333\t40014334
//
// The moon label row has no leading whitespace; ore rows start with \t.
// Multiple moon blocks may appear in sequence.
function parseMoonSurvey(text: string): {
  systemName: string;
  planetName: string;
  moonNumber: number;
  oreType: string;
  orePercent: number;
}[] {
  const lines = text.split(/\r?\n/);
  const results: { systemName: string; planetName: string; moonNumber: number; oreType: string; orePercent: number }[] = [];

  let currentSystemName: string | null = null;
  let currentPlanetName: string | null = null;
  let currentMoonNumber: number | null = null;

  for (const line of lines) {
    // Skip blank lines and the header row
    if (!line.trim()) continue;
    if (/^Moon\t/i.test(line)) continue;

    if (line.startsWith('\t')) {
      // Ore row: \tOreType\tQuantity\t...
      if (currentSystemName === null || currentMoonNumber === null || currentPlanetName === null) continue;
      const cols = line.split('\t');
      // cols[0] is the empty string before the leading tab
      const oreType = cols[1]?.trim();
      const orePercent = parseFloat(cols[2] ?? '');
      if (!oreType || Number.isNaN(orePercent)) continue;
      results.push({ systemName: currentSystemName, planetName: currentPlanetName, moonNumber: currentMoonNumber, oreType, orePercent });
    } else {
      // Moon label row: "7-K5EL II - Moon 1"
      // moonMatch[1] is the planet label e.g. "7-K5EL II"; system name is derived by stripping the trailing word
      const moonMatch = line.trim().match(/^(.+?)\s*-\s*Moon\s+(\d+)$/i);
      if (!moonMatch) continue;
      currentPlanetName = moonMatch[1].trim();
      currentSystemName = currentPlanetName;
      currentMoonNumber = parseInt(moonMatch[2], 10);
    }
  }

  return results;
}

// Try to resolve a moon label system name to a system id.
// The label can be "Jita IV" (system + planet roman numeral).
// We try: exact match, then strip the last word and try again.
function resolveSystemId(
  db: ReturnType<typeof getDb>,
  label: string,
): number | null {
  type Row = { id: number };

  // Exact match first (some systems have names that look like "X - Y")
  const exact = db.prepare('SELECT id FROM systems WHERE name = ?').get(label) as Row | undefined;
  if (exact) return exact.id;

  // Strip trailing word (planet roman numeral like "IV", "XII", or Arabic like "3")
  const stripped = label.replace(/\s+\S+$/, '').trim();
  if (stripped && stripped !== label) {
    const row = db.prepare('SELECT id FROM systems WHERE name = ?').get(stripped) as Row | undefined;
    if (row) return row.id;
  }

  return null;
}

export function registerMoonScansIpc(): void {
  ipcMain.handle('moonScans.import', (_, clipboardText: string) => {
    const db = getDb();
    const parsed = parseMoonSurvey(clipboardText);

    // Resolve system names → ids, skip unresolvable rows
    const resolved = parsed
      .map((r) => ({ ...r, systemId: resolveSystemId(db, r.systemName) }))
      .filter((r): r is typeof r & { systemId: number } => r.systemId !== null);

    const systemIds = new Set(resolved.map((r) => r.systemId));
    const systemCount = systemIds.size;

    const now = new Date().toISOString();

    const upsert = db.prepare(`
      INSERT INTO moon_scans (session_id, system_id, moon_number, planet_name, ore_type, ore_percent)
      VALUES (@sessionId, @systemId, @moonNumber, @planetName, @oreType, @orePercent)
      ON CONFLICT(system_id, moon_number, ore_type) DO UPDATE SET
        session_id  = excluded.session_id,
        planet_name = excluded.planet_name,
        ore_percent = excluded.ore_percent
    `);

    const insertSession = db.prepare(`
      INSERT INTO moon_scan_sessions (imported_at, system_count) VALUES (?, ?)
    `);

    let sessionId!: number;
    let moonsImported = 0;

    db.transaction(() => {
      const info = insertSession.run(now, systemCount);
      sessionId = info.lastInsertRowid as number;

      for (const row of resolved) {
        upsert.run({
          sessionId,
          systemId: row.systemId,
          moonNumber: row.moonNumber,
          planetName: row.planetName,
          oreType: row.oreType,
          orePercent: row.orePercent,
        });
        moonsImported++;
      }
    })();

    const { BrowserWindow } = require('electron') as typeof import('electron');
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('data-refreshed');
    }

    return { sessionId, systemCount, moonsImported };
  });

  ipcMain.handle('moonScans.list', (_, systemId?: number): MoonScan[] => {
    const db = getDb();
    type Row = {
      id: number;
      session_id: number | null;
      system_id: number;
      system_name: string;
      moon_number: number;
      planet_name: string | null;
      planet_type: string | null;
      ore_type: string;
      ore_percent: number;
      scan_date: string | null;
    };

    const baseSelect = `
      SELECT ms.id, ms.session_id, ms.system_id, s.name AS system_name,
             ms.moon_number, ms.planet_name,
             p.planet_type,
             ms.ore_type, ms.ore_percent, ms.scan_date
      FROM moon_scans ms
      JOIN systems s ON s.id = ms.system_id
      LEFT JOIN planets p ON p.system_id = ms.system_id AND p.name = ms.planet_name`;

    const rows = systemId !== undefined
      ? db.prepare(`${baseSelect} WHERE ms.system_id = ? ORDER BY ms.moon_number`).all(systemId) as Row[]
      : db.prepare(`${baseSelect} ORDER BY s.name, ms.moon_number`).all() as Row[];

    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      systemId: r.system_id,
      systemName: r.system_name,
      moonNumber: r.moon_number,
      planetName: r.planet_name,
      planetType: r.planet_type,
      oreType: r.ore_type,
      orePercent: r.ore_percent,
      scanDate: r.scan_date,
    }));
  });

  ipcMain.handle('moonScans.sessions', (): MoonScanSession[] => {
    const db = getDb();
    type Row = { id: number; imported_at: string; system_count: number };
    const rows = db
      .prepare('SELECT id, imported_at, system_count FROM moon_scan_sessions ORDER BY imported_at DESC')
      .all() as Row[];
    return rows.map((r) => ({
      id: r.id,
      importedAt: r.imported_at,
      systemCount: r.system_count,
    }));
  });

  ipcMain.handle('moonScans.deleteSession', (_, sessionId: number): void => {
    const db = getDb();
    db.prepare('DELETE FROM moon_scan_sessions WHERE id = ?').run(sessionId);
    // Cascade handles moon_scans rows. Notify renderer that scan data changed.
    const { BrowserWindow } = require('electron') as typeof import('electron');
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('data-refreshed');
    }
  });
}
