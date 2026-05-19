# Moon scans

## Purpose
Storage and display of moon scan data pasted from EVE's moon survey clipboard format. Organises scans by system and moon number, showing ore type, R-tier classification, and percentage per moon. Provides the data source for Metenox/Athanor/Tatara profitability calculations in the Structures feature, and for moon-tier stat overlays on the Region Map. Also rolls up total ISK/hr across all assigned drills via the summary section at the top of the page, filterable by max-tier-present, structure type, and active-plan scope.

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
  moon_id     INTEGER NOT NULL,            -- canonical EVE MoonID from clipboard
  moon_number INTEGER NOT NULL,
  planet_name TEXT,
  ore_type    TEXT NOT NULL,
  ore_percent REAL NOT NULL,
  scan_date   TEXT,
  UNIQUE(moon_id, ore_type)
);

CREATE TABLE IF NOT EXISTS moon_drill_assignments (
  moon_id        INTEGER PRIMARY KEY,
  system_id      INTEGER NOT NULL REFERENCES systems(id),
  structure_type TEXT NOT NULL              -- 'Metenox' | 'Athanor' | 'Tatara'
);
```

## IPC

- `moonScans.import(clipboardText)` → `{ sessionId, systemCount, moonsImported }` — parses EVE moon survey format, upserts rows, writes a session record.
- `moonScans.list(systemId?)` → `MoonScan[]` — all scans, or filtered to one system.
- `moonScans.sessions()` → `MoonScanSession[]` — list of import sessions with counts.
- `moonScans.deleteSession(sessionId)` — cascades to all scans in the session; broadcasts `data-refreshed`.
- `moonScans.getDrillTypes()` → `MoonDrillAssignment[]` — all (moonId, systemId, structureType) selections.
- `moonScans.setDrillType(moonId, systemId, structureType | null)` — upserts or clears the drill assignment for a moon.
- `moonScans.profitability(moonId, structureType)` → `ProfitabilityResult | null` — computes profit/hr from the moon's scan ores + current price field. Plan-independent; reuses [`computeProfitabilityForMoonId`](../../electron/ipc/profitability.ts). A legacy `computeProfitabilityForMoon(systemId, moonNumber, …)` variant remains for `structures.profitability` until `plan_structures` is migrated to MoonID.
- `plans.getSystemIds(planId)` → `number[]` — expanded list of system IDs covered by the plan's scopes; used by the summary's "active plan systems only" filter.

## Critical files

- `src/panels/MoonScansPage.tsx` — paste textarea, session list, tier filter, per-system/moon ore composition display.
- `electron/ipc/moonScans.ts` — all IPC handlers; clipboard text parser; system name → `system_id` lookup; `oreRTier()` exported for use by map IPC.
- `electron/ipc/map.ts` — imports `oreRTier` to implement `map.moonStats`.
- `electron/ipc/index.ts` — registers moonScans handlers.
- `electron/preload.ts` — exposes `moonScans.*`.
- `src/types/index.ts` — `MoonScan`, `MoonScanSession`, `MoonCounts`, `EveSovApi.moonScans.*`.
- `src/shell/DockShell.tsx` — registers MoonScansPage panel.
- `src/shell/ActivityBar.tsx` — adds Moon Scans item (glyph `◎`).
- `electron/db/schema.ts` — both tables above.

## Key decisions

- **Import UI**: a `<textarea>` with "Paste moon survey here" placeholder, no `window.prompt()`. On submit, text is sent to `moonScans.import`; the result (session summary) is displayed inline.
- **Parser** runs in the main process so it can resolve system names to `system_id` via the `systems` table. EVE moon survey format has a header row (`Moon\tMoon Product\tQuantity\tOre TypeID\tSolarSystemID\tPlanetID\tMoonID`), then alternating moon label rows (no leading tab, e.g. `7-K5EL II - Moon 1`) and ore rows (leading tab, e.g. `\tBitumens\t0.298…\t45492\t…\t40014334`). The parser strips the trailing planet word from the moon label to resolve the system name, and reads column 7 (MoonID) as the canonical key.
- **Canonical MoonID key**: moon numbering is per-planet in EVE (planet VI - Moon 1 vs planet IX - Moon 1 are different moons that share a number). Storing only `(system_id, moon_number)` collided across planets and dropped ores. The clipboard already carries the globally-unique MoonID; we store it and key both `moon_scans` and `moon_drill_assignments` on it. Existing user DBs are wiped on first launch with the new schema and ask the user to re-paste — see [electron/db/migrations.ts](../../electron/db/migrations.ts).
- `UNIQUE(moon_id, ore_type)` with `ON CONFLICT DO UPDATE` — re-importing an updated scan overwrites old data without leaving orphans.
- **Session management** allows deleting stale scan batches. `ON DELETE CASCADE` on `moon_scans.session_id` handles cleanup.
- **R-tier classification**: ore type matched by substring against 20 canonical names (5 per tier, R4–R64). `oreRTier()` in `moonScans.ts` is the single source of truth, imported by `map.ts` for `map.moonStats`.
- **Per-moon drill assignment**: each moon row in MoonScansPage has a dropdown (`— None —` / Metenox / Athanor / Tatara). Selecting a type writes to `moon_drill_assignments` and the page fetches `moonScans.profitability` for that moon, displaying `profitPerHour` formatted as `B/M/K ISK/hr`. If `data.hasMarketData()` is false the row shows "Enable Data Sync" instead of a number. Plan-independent on purpose: this is moon-level, not plan-level, configuration.
- **`data-refreshed`** (not `plan-changed`) is broadcast after a session delete, since moon scans are plan-independent data.
- **Summary section** at the top of the page aggregates over `moon_drill_assignments` only (not `plan_structures`). A moon's tier for filter purposes is the **max R-tier present** in its ore composition — the whole moon's profit counts toward that tier; the filter does not slice ISK by ore. Grouped by system, expandable to per-moon detail. Grand total ISK/hr and moon count shown in the header. Plan-only checkbox uses `plans.getSystemIds(activePlanId)` to expand region/constellation scopes to system IDs; disabled when no plan is active.
- `map.moonStats` is plan-scoped — only systems in the active plan's scope within the region are returned. The moon stat modes on the Region Map are only meaningful when a plan is active.

## R-tier ore classification

| Tier | Ores |
|------|------|
| R4   | Zeolites, Bitumens, Sylvite, Coesite |
| R8   | Scheelite, Titanite, Cobaltite, Euxenite |
| R16  | Sperrylite, Chromite, Otavite, Vanadinite |
| R32  | Carnotite, Zircon, Pollucite, Cinnabar |
| R64  | Monazite, Loparite, Xenotime, Ytterbite |

Variant ore names (e.g. "Glistening Carnotite") are matched by substring.

## Open questions / next steps

- Bulk import from a directory of scan files (currently clipboard-only).
- Scan age indicator — scans older than a configurable threshold shown as stale.
- `moonScans.list(systemId)` is available but no per-system drill-down UI in SystemDetail yet.
