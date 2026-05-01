# Moon scans

## Purpose
Storage and display of moon scan data pasted from EVE's moon survey clipboard format. Organises scans by system and moon number, showing ore composition per moon. Provides the data source for Metenox/Athanor/Tatara profitability calculations in the Structures feature.

## Schema

```sql
CREATE TABLE IF NOT EXISTS moon_scan_sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  imported_at  TEXT NOT NULL,
  system_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS moon_scans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER REFERENCES moon_scan_sessions(id) ON DELETE CASCADE,
  system_id   INTEGER NOT NULL REFERENCES systems(id),
  moon_number INTEGER NOT NULL,
  ore_type    TEXT NOT NULL,
  ore_percent REAL NOT NULL,
  scan_date   TEXT,
  UNIQUE(system_id, moon_number)
);
```

## IPC

- `moonScans.import(clipboardText)` → `{ sessionId, systemCount, moonsImported }` — parses EVE moon survey format, upserts rows, writes a session record.
- `moonScans.list(systemId?)` → `MoonScan[]` — all scans, or filtered to one system.
- `moonScans.sessions()` → `MoonScanSession[]` — list of import sessions with counts.
- `moonScans.deleteSession(sessionId)` — cascades to all scans in the session; broadcasts `data-refreshed`.

## Critical files

- `src/panels/MoonScansPage.tsx` — paste textarea, session list, per-moon ore composition display.
- `electron/ipc/moonScans.ts` — all IPC handlers; clipboard text parser; system name → `system_id` lookup.
- `electron/ipc/index.ts` — registers moonScans handlers.
- `electron/preload.ts` — exposes `moonScans.*`.
- `src/types/index.ts` — `MoonScan`, `MoonScanSession`, `EveSovApi.moonScans.*`.
- `src/shell/DockShell.tsx` — registers MoonScansPage panel.
- `src/shell/ActivityBar.tsx` — adds Moon Scans item.
- `electron/db/schema.ts` — both tables above.

## Key decisions

- **Import UI**: a `<textarea>` with "Paste moon survey here" placeholder, no `window.prompt()`. On submit, text is sent to `moonScans.import`; the result (session summary) is displayed inline.
- **Parser** runs in the main process so it can resolve system names to `system_id` via the `systems` table. EVE moon survey format is tab-separated with moon label (e.g. "Jita IV - Moon 4"), ore type, and percentage per line.
- `UNIQUE(system_id, moon_number)` with `INSERT OR REPLACE` semantics — re-importing an updated scan overwrites the old data without leaving orphans. The replaced row keeps the newer `session_id`.
- **Session management** allows deleting stale scan batches. `ON DELETE CASCADE` on `moon_scans.session_id` handles cleanup. A session record is written before the rows so partial imports are attributable.
- `data-refreshed` (not `plan-changed`) is broadcast after a session delete, since moon scans affect the Structures profitability calculation, not plan state.
- Ore composition is displayed as a small percentage bar per ore type within each moon row.

## Open questions / next steps

- Bulk import from a directory of scan files (currently clipboard-only).
- Scan age indicator — scans older than a configurable threshold shown as stale.
- Integration with market prices for the profitability calculation (see Structures.md).
