# Data management

## Purpose
Lets the user manage the underlying data the app runs on: edit upgrade costs and resource values, re-import updated CSVs, refresh SDE data, and purge stale market or other data. Acts as the admin surface for keeping the seed data current without a full reseed.

## Schema

```sql
CREATE TABLE IF NOT EXISTS upgrades_seed (
  name          TEXT PRIMARY KEY,
  power         REAL, workforce REAL,
  superionic_ice REAL, magmatic_gas REAL, startup REAL,
  category      TEXT, upgrade_type TEXT, time_required INTEGER
);
```

`upgrades_seed` is a read-only mirror of the seed-time `upgrades` table. Populated at seed time, never written by user actions. `data.resetUpgrade` copies a row from here back into `upgrades`.

`system_adm_activities(system_id, activity TEXT, last_updated TEXT)` — managed here; see Inspector.md.

## IPC

- `data.updateUpgrade(name, values)` — writes user-supplied values into the `upgrades` table; broadcasts `data-refreshed`.
- `data.resetUpgrade(name)` — copies the `upgrades_seed` row back into `upgrades`; broadcasts `data-refreshed`.
- `data.updateSystemResource(systemId, field, value)` — writes to `stars.power` or `planets.power` / `planets.workforce`; broadcasts `data-refreshed`.
- `data.refreshSov({ kind, path })` — already in `EveSovApi`; wires the existing IPC to a file-picker UI here. Shows import report (counts + warnings) after completion.
- `data.exportTemplates(dir)` — already in `EveSovApi`; triggered from this page.
- `data.purgeMarketData()` — deletes from the market data table (created when Data Sync ships).
- `data.hasMarketData()` → `boolean` — used by Structures profitability gating.
- `data.importAdmActivities(text)` — parses a CSV or clipboard paste of ADM activity data into `system_adm_activities`; broadcasts `data-refreshed`.

## Critical files

- `src/panels/DataManagementPage.tsx` — upgrade editor table, system resource editor, CSV refresh section, purge controls, data sync toggle.
- `electron/ipc/data.ts` — add `updateUpgrade`, `resetUpgrade`, `updateSystemResource`, `purgeMarketData`, `hasMarketData`, `importAdmActivities`.
- `electron/preload.ts` — expose new channels.
- `src/types/index.ts` — add new channel types.
- `electron/db/schema.ts` — `upgrades_seed` table; `system_adm_activities` table (see Inspector.md).
- `electron/db/seed.ts` — populate `upgrades_seed` alongside `upgrades` at seed time.
- `src/shell/DockShell.tsx` — registers DataManagementPage panel.
- `src/shell/ActivityBar.tsx` — adds Data Management item.

## Key decisions

- **Upgrade editor**: a full-width table of all upgrades with inline `<input type="number">` cells. Changes commit on blur or Enter. A "Reset" button per row calls `data.resetUpgrade`. Changed rows are visually flagged (e.g. italic or accent border) until reset.
- **`upgrades_seed` shadow table**: seeded once and never modified by user actions. This is the safest way to support "reset to default" without re-running the full seed. The seed script writes to both tables in the same transaction.
- **System resource editor**: a system-search input narrows to a system, then shows editable fields for star power and per-planet power/workforce. Writes are targeted (`stars.power`, `planets.power`, etc.). `data-refreshed` is broadcast so SystemDetail re-fetches.
- **Purge**: destructive operations use `window.confirm()` (permitted per CLAUDE.md). The page shows row counts per purgeable table so the user knows what they're deleting.
- **Data sync toggle**: a boolean pref (`settings.dataSync.enabled`) persisted via `prefs.set`. When disabled, all market-data-dependent features (Structures profitability, ADM data refresh) show a "Data Sync disabled" message.
- **CSV re-import UI**: file pickers per CSV type (stars, planets, upgrades). Calls the existing `data.refreshSov` IPC. Result (counts + warnings) rendered inline — same format as the seed script's console output.
- `data-refreshed` (not `plan-changed`) is broadcast after data mutations. Panels that read static data (`SystemDetail`, `UpgradeCatalog`) subscribe to `data-refreshed` to re-fetch.

## Open questions / next steps

- SDE refresh flow (re-import regions/constellations/systems after a CCP expansion) — requires re-running the SDE importer path, which currently only runs at seed time.
- Market data ingestion source — ESI endpoint or third-party price file (e.g. Fuzzwork market dump). Design TBD.
- ADM activity import format — EVE does not provide a standard export; likely manual entry or a custom CSV agreed on by the alliance.
