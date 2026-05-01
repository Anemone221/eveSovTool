# EVE SOV Planning Tool — Implementation Plan

## Context
Greenfield Electron desktop tool for planning EVE Online sovereignty (SOV) upgrades. Local-only, single user. The user wants to select any combination of regions / constellations / systems and assign SOV upgrades to them, then see whether each system's resource budget balances. UX inspired by VS Code: a main shell with dockable panels that can be torn out into native OS windows.

The repo contains LICENSE, README, three sov-data CSVs, and four EVE SDE JSONL files used to crosswalk the proper hierarchy and IDs. This plan covers the full initial scaffold.

## Decisions locked with user
- **Stack**: Electron + React + TypeScript + Vite (`electron-vite` scaffold).
- **Persistence**: SQLite in app userData via `better-sqlite3`.
- **Static data ingest**: I bake the seven source files into a `seed.db` shipped with the app. "Refresh data" is **per-CSV** — the user picks which file to refresh (stars, planets, or upgrades) and only that table is rewritten. "Generate templates" exports blank CSVs with the documented headers. The SDE JSONL files are a less-frequently-refreshed reference set (also re-importable, but expected to change rarely).
- **Plans**: "Universe plans" — one plan can span any combination of regions/constellations/systems. Multiple named plans coexist.
- **Upgrade rules**: Validate that each system's resource budget (Power, Workforce, Superionic Ice, Magmatic Gas) covers the sum of assigned upgrade costs. Show running totals per system / constellation / region / plan.
- **Multi-window**: Hybrid — single main BrowserWindow hosts a Dockview layout; any panel can be popped out into its own native BrowserWindow and later re-docked.

## Source data inventory
Sov CSVs (user-curated, refreshable):
- **stars.csv** — `starID, regionName, System Name, Star, power`
- **planets.csv** — `planetID, Region Name, System Name, Planet Name, Power, Workforce, Superionic Ice / Hour, Magmatic Gas / Hour`
- **sovUpgardes.csv** — `Upgrade, Power, Workforce, Superionic Ice, Magmatic Gas, Startup` (sic — note the spelling)

EVE SDE JSONL (canonical hierarchy & IDs):
- **mapRegions.jsonl** — `_key` (regionID), `name.en`, `factionID`, `constellationIDs[]`
- **mapConstellations.jsonl** — `_key` (constellationID), `regionID`, `name.en`, `solarSystemIDs[]`, `factionID`
- **mapSolarSystems.jsonl** — `_key` (solarSystemID), `constellationID`, `regionID`, `name.en`, `securityStatus`, `securityClass`, `starID`, `planetIDs[]`
- **mapStars.jsonl** — `_key` (starID), `solarSystemID`, `radius`, `statistics.{spectralClass, luminosity, temperature}`, `typeID`

Notable observations driving design:
1. **The SDE supplies the hierarchy**, so the schema uses real region/constellation/system IDs and we drop name-based joins.
2. **Sov CSVs map to SDE entities by ID**: `stars.csv.starID` → `mapStars._key`; `planets.csv.planetID` → an entry in some `mapSolarSystems.planetIDs[]`. Importer uses these IDs as the foreign-key bridge; the `regionName`/`System Name`/`Region Name`/`Planet Name` columns in the CSVs become validation cross-checks (warn if they don't match SDE names).
3. **Upgrade costs can be negative** (e.g., `Workforce Mecha-Tooling 1` produces workforce). Validation must support producers, not just consumers.
4. **Sov CSVs cover only nullsec sov-eligible space**; SDE covers all of EVE. We render the full hierarchy in the explorer but visually mark systems that don't appear in `stars.csv` as "non-sov" (read-only, no upgrade slots).
5. **`Startup` is the one-time fuel activation cost** required to online the upgrade. It is *not* a recurring resource — it's reported separately as a "fuel to activate" total per system / per plan, and does not enter the ongoing Power/Workforce/Ice/Gas budget.
6. **Upgrade tiers do not require prerequisites** — `Foo 2` does not need `Foo 1`. Resource budget is the only validation in v1.

## Architecture
- Three Electron processes: `main`, `preload`, `renderer`.
- `main` owns the SQLite handle, file-system access, CSV/JSONL ingest, and the WindowManager.
- `preload` exposes a typed `window.evesov` surface via `contextBridge` (`nodeIntegration: false`, `contextIsolation: true`).
- `renderer` is a React app. The same renderer bundle is loaded by every window; a `?panel=...&params=...` URL determines whether it renders the full DockShell or a single popped-out panel.
- SQLite is the single source of truth — popped-out windows do not need a shared in-memory store. After any write the main process broadcasts a `plan-changed` / `data-refreshed` IPC event so all renderers invalidate caches.

## Data flow
1. Source files sit in `/data` (and currently in repo root; importer accepts either path).
2. `npm run seed` runs `electron/db/seed.ts` → parses the four JSONL files (line-by-line stream) and three CSVs (Papa Parse) → writes `resources/seed.db` inside a single transaction.
3. `electron-builder` bundles `resources/seed.db` into the installer.
4. On first launch, `main.ts` copies `seed.db` → `userData/app.db`. Subsequent launches reuse `app.db`.
5. "Refresh data" replaces only sov-data tables (`stars`, `planets`, `upgrades` and the per-row sov fields) in `app.db`; SDE tables and plan tables are preserved.
6. Optional "Refresh SDE" (advanced flow) replaces SDE tables; sov-data tables and plan tables are preserved.
7. "Generate templates" writes three CSVs with the documented headers + one example row to a user-chosen folder.

## Data model (SQLite)
SDE-derived tables (rarely refreshed):
```sql
CREATE TABLE regions (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  faction_id  INTEGER
);

CREATE TABLE constellations (
  id          INTEGER PRIMARY KEY,
  region_id   INTEGER NOT NULL REFERENCES regions(id),
  name        TEXT NOT NULL,
  faction_id  INTEGER
);
CREATE INDEX idx_constellations_region ON constellations(region_id);

CREATE TABLE systems (
  id                INTEGER PRIMARY KEY,                                -- solarSystemID
  constellation_id  INTEGER NOT NULL REFERENCES constellations(id),
  region_id         INTEGER NOT NULL REFERENCES regions(id),            -- denormalized for fast filtering
  name              TEXT NOT NULL,
  security_status   REAL,
  security_class    TEXT
);
CREATE INDEX idx_systems_constellation ON systems(constellation_id);
CREATE INDEX idx_systems_region        ON systems(region_id);
CREATE INDEX idx_systems_name          ON systems(name);
```

Sov-data tables (refreshable from CSVs):
```sql
CREATE TABLE stars (
  id              INTEGER PRIMARY KEY,                                  -- starID (40xxxxxx)
  system_id       INTEGER NOT NULL UNIQUE REFERENCES systems(id),
  spectral_class  TEXT,                                                 -- from SDE
  description     TEXT,                                                 -- "Star" column (e.g. "Sun G3 (Pink Small)")
  power           INTEGER NOT NULL DEFAULT 0                            -- from stars.csv
);

CREATE TABLE planets (
  id                       INTEGER PRIMARY KEY,                         -- planetID
  system_id                INTEGER NOT NULL REFERENCES systems(id),
  name                     TEXT NOT NULL,
  power                    INTEGER NOT NULL DEFAULT 0,
  workforce                INTEGER NOT NULL DEFAULT 0,
  superionic_ice_per_hour  INTEGER NOT NULL DEFAULT 0,
  magmatic_gas_per_hour    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_planets_system ON planets(system_id);

CREATE TABLE upgrades (
  name             TEXT PRIMARY KEY,
  power            INTEGER NOT NULL,                                    -- negative = produces
  workforce        INTEGER NOT NULL,
  superionic_ice   INTEGER NOT NULL,
  magmatic_gas     INTEGER NOT NULL,
  startup          INTEGER NOT NULL                                     -- one-time fuel cost to online the upgrade
);

-- Convenience view: every sov-eligible system with budget totals.
CREATE VIEW system_budget AS
SELECT
  s.id                                                            AS system_id,
  s.name                                                          AS system_name,
  s.constellation_id, s.region_id,
  COALESCE(st.power, 0)
    + COALESCE((SELECT SUM(power)                   FROM planets p WHERE p.system_id = s.id), 0)  AS available_power,
  COALESCE((SELECT SUM(workforce)                   FROM planets p WHERE p.system_id = s.id), 0)  AS available_workforce,
  COALESCE((SELECT SUM(superionic_ice_per_hour)     FROM planets p WHERE p.system_id = s.id), 0)  AS available_ice,
  COALESCE((SELECT SUM(magmatic_gas_per_hour)       FROM planets p WHERE p.system_id = s.id), 0)  AS available_gas,
  CASE WHEN st.id IS NULL THEN 0 ELSE 1 END                                                       AS sov_eligible
FROM systems s
LEFT JOIN stars st ON st.system_id = s.id;
```

Plan tables (user-mutable, preserved across data refreshes):
```sql
CREATE TABLE plans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE plan_scopes (
  plan_id     INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  scope_type  TEXT NOT NULL CHECK (scope_type IN ('region','constellation','system')),
  scope_id    INTEGER NOT NULL,
  PRIMARY KEY (plan_id, scope_type, scope_id)
);

CREATE TABLE plan_upgrades (
  plan_id       INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  system_id     INTEGER NOT NULL REFERENCES systems(id),
  upgrade_name  TEXT    NOT NULL REFERENCES upgrades(name),
  ordering      INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  PRIMARY KEY (plan_id, system_id, upgrade_name)
);

CREATE TABLE preferences (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
```

## Importer behaviour (`electron/csv/importer.ts` + `electron/sde/importer.ts`)
SDE pass (line-by-line `readline` over each `.jsonl`):
1. `mapRegions.jsonl` → `regions(id, name.en, factionID)`.
2. `mapConstellations.jsonl` → `constellations(id, regionID, name.en, factionID)`.
3. `mapSolarSystems.jsonl` → `systems(id, constellationID, regionID, name.en, securityStatus, securityClass)`. Cache `(planetID → solarSystemID)` and `(starID → solarSystemID)` maps in memory for the next pass.
4. `mapStars.jsonl` → `stars(id, system_id, spectral_class)` (description/power filled in by the sov pass).

Sov pass (Papa Parse over each `.csv`):
5. `stars.csv` → for each row, look up `starID` in the cached map; `INSERT OR REPLACE` into `stars` setting `description` and `power`. If `regionName`/`System Name` disagrees with SDE, push a warning. If `starID` isn't in SDE, push a warning and skip.
6. `planets.csv` → resolve `planetID` to `system_id` via the cached planet map; insert into `planets` (id, system_id, name, power, workforce, ice/h, gas/h). Cross-check `Region Name` and `System Name` against SDE; warn on mismatch. Skip rows whose planetID isn't in SDE.
7. `sovUpgardes.csv` → trim, drop blank rows, insert into `upgrades`.

The whole import runs inside one transaction. The function returns `{counts, warnings[]}` so the UI can surface mismatches without crashing the import.

## Resource budget validation
Per system in a plan:
- `available_*` come from the `system_budget` view above.
- `consumed_* = SUM(upgrade.<resource>)` over assigned upgrades for that (plan, system).
- A system is **balanced** when `consumed_r ≤ available_r` for every resource `r`.
- `total_startup_fuel = SUM(upgrade.startup)` over assigned upgrades — reported per system / constellation / region / plan as a one-time activation cost, separate from the ongoing budget.
- `plans.summary(planId)` returns rollups at system / constellation / region / plan level: available, consumed, remaining, total startup fuel, plus a list of unbalanced systems with the failing resources.

## Multi-window (hybrid)
- Main BrowserWindow loads `/` → renders `<DockShell>` (activity bar + Dockview area).
- A panel's "tear out" button calls `windows.openPanel(panelId, params)` → main process spawns a child BrowserWindow loading `/?panel=<id>&params=<json>` → renders `<PoppedOutShell>` (single panel, no activity bar).
- `WindowManager` (in main) tracks all open windows, broadcasts events, and handles `windows.dockBack(windowId)` requests by closing the child window and inserting the panel back into the main DockShell.

## IPC surface (`window.evesov`)
- `data.tree(rootScope?)` — region → constellation → system hierarchy with sov-eligibility flag.
- `data.search(q, filters)`
- `data.region(id)` · `data.constellation(id)` · `data.system(id)`
- `data.upgrades()` · `data.upgrade(name)`
- `data.refreshSov({kind: 'stars'|'planets'|'upgrades', path})` → `{counts, warnings}` — refreshes a single sov CSV; other sov tables untouched.
- `data.refreshSde({regions?, constellations?, solarSystems?, stars?})` (advanced; per-file optional)
- `data.exportTemplates(dir)`
- `plans.list/get/create/rename/delete`
- `plans.setScopes(planId, scopes[])`
- `plans.assignUpgrade(planId, systemId, upgradeName)` → `{ok, balance}`
- `plans.removeUpgrade(planId, systemId, upgradeName)`
- `plans.summary(planId)` — rollups at all four levels, unbalanced-system list.
- `windows.openPanel(panelId, params)` · `windows.dockBack(windowId)`
- `system.events.on('plan-changed' | 'data-refreshed', cb)`

## Default panels
- **Universe explorer**: region → constellation → system tree. Per-system balance indicator for the active plan; non-sov systems greyed out.
- **System detail**: system info (region, constellation, star, security), planet table, current plan upgrades for this system, "available upgrades" list with feasibility check, live resource budget bar (Power/Workforce/Ice/Gas).
- **Constellation overview**: aggregated resource totals across constellation, list of unbalanced systems.
- **Region overview**: same, region-scoped.
- **Plan inspector**: assignments list, plan-wide rollups, unbalanced-system summary, scope picker.
- **Upgrade catalog**: searchable upgrade list with resource costs and the `Startup` column.
- **Search**: cross-entity search (region / constellation / system / upgrade by name).

Activity bar (left of DockShell) activates the corresponding panel as a dock tab. Each panel has a tear-out button.

## Project layout
```
eveSovTool/
├── electron/
│   ├── main.ts                     # bootstrap, window lifecycle, seed-copy on first run
│   ├── preload.ts                  # contextBridge surface
│   ├── db/
│   │   ├── schema.sql
│   │   ├── connection.ts           # better-sqlite3 handle, migrations
│   │   └── seed.ts                 # CLI: npm run seed
│   ├── sde/importer.ts             # JSONL → SDE tables
│   ├── csv/
│   │   ├── importer.ts             # CSV → sov-data tables
│   │   └── templates.ts            # template CSV export
│   ├── ipc/
│   │   ├── data.ts
│   │   ├── plans.ts                # incl. resource-budget validation
│   │   └── windows.ts
│   └── windows/manager.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx                     # router: DockShell vs PoppedOutShell
│   ├── shell/
│   │   ├── DockShell.tsx
│   │   ├── ActivityBar.tsx
│   │   └── PoppedOutShell.tsx
│   ├── panels/
│   │   ├── TreeExplorer.tsx
│   │   ├── SystemDetail.tsx
│   │   ├── ConstellationOverview.tsx
│   │   ├── RegionOverview.tsx
│   │   ├── PlanInspector.tsx
│   │   ├── UpgradeCatalog.tsx
│   │   └── Search.tsx
│   ├── api/evesov.ts               # typed wrapper over window.evesov
│   ├── state/uiStore.ts            # zustand: UI-only state
│   └── types/index.ts              # shared DTOs
├── data/                           # canonical source location (importer also accepts repo root)
│   ├── stars.csv
│   ├── planets.csv
│   ├── sovUpgardes.csv
│   ├── mapRegions.jsonl
│   ├── mapConstellations.jsonl
│   ├── mapSolarSystems.jsonl
│   └── mapStars.jsonl
├── resources/seed.db               # build artifact, bundled
├── electron.vite.config.ts
├── electron-builder.yml
├── package.json
└── tsconfig.json
```

## Implementation phases
1. **Scaffold**: `electron-vite` React+TS template; install `better-sqlite3`, `dockview-react`, `papaparse`, `@tanstack/react-table`, `zustand`. Wire contextBridge + a `ping` IPC. App launches.
2. **Schema & seed**: write `schema.sql`, `electron/sde/importer.ts`, `electron/csv/importer.ts`, and `electron/db/seed.ts`. Run against the seven source files → produce `seed.db`. Verify counts and spot-check `LZ-6SU` (region: Vale of the Silent) is wired all the way through.
3. **Read-only data IPC + first panels**: `data.tree`, `data.system`, `data.upgrades`. Render `TreeExplorer` and `SystemDetail` in a plain layout (no docking yet) to validate the IPC + types.
4. **Dockview shell**: `DockShell` + `ActivityBar`, default panel layout, persist dock state in `preferences`.
5. **Plans**: CRUD, `setScopes`, `assignUpgrade` / `removeUpgrade` with resource-budget validation, `PlanInspector` panel.
6. **Rollups & balance UI**: `plans.summary`, `ConstellationOverview` / `RegionOverview` panels, in-tree balance indicators, system-detail budget bar.
7. **Tear-out windows**: `WindowManager`, `openPanel` / `dockBack`, `PoppedOutShell` route, broadcast invalidation.
8. **Refresh + templates UI**: per-CSV refresh dialog (pick which file: stars / planets / upgrades), warnings panel showing import mismatches, `data.exportTemplates`. Advanced "Refresh SDE" tucked behind a settings menu.
9. **Polish**: cross-entity search, keyboard shortcuts, dark theme, import-warnings surfacing.

## Critical files
- `electron/main.ts` — bootstrap, copies seed.db on first run.
- `electron/preload.ts` — typed `window.evesov`.
- `electron/db/schema.sql` — schema above.
- `electron/db/seed.ts` — CLI entry, calls SDE then CSV importer.
- `electron/sde/importer.ts` — JSONL streaming importer.
- `electron/csv/importer.ts` — CSV importer; cross-checks names against SDE.
- `electron/ipc/plans.ts` — resource-budget validation + rollups (uses `system_budget` view).
- `electron/windows/manager.ts` — tear-out / dock-back orchestration.
- `src/shell/DockShell.tsx` — Dockview layout + tear-out wiring.
- `src/panels/SystemDetail.tsx` — primary editing surface (budget bar lives here).
- `src/panels/PlanInspector.tsx` — plan-wide rollups.
- `src/api/evesov.ts` — typed renderer wrapper.

## Resolved (was open, now decided)
- `Startup` = one-time fuel cost to online the upgrade. Tracked as `total_startup_fuel` in rollups, separate from the ongoing resource budget.
- Tier-N upgrades do *not* require prior tiers. No prerequisite logic in v1.
- "Refresh data" is per-CSV — user picks one of `stars` / `planets` / `upgrades`; the others are untouched.
- SDE lore (multi-language `description` blobs in regions/constellations) is ignored — only `name.en`, IDs, and structural fields are imported.

## Verification
- `npm run dev` → main window launches; DockShell renders with activity bar and default panel layout.
- `npm run seed` → `resources/seed.db` exists. Manual checks via `sqlite3 resources/seed.db`:
  - `SELECT COUNT(*) FROM regions;` matches lines in `mapRegions.jsonl`.
  - `SELECT COUNT(*) FROM constellations;` and `systems` match their SDE files.
  - `SELECT * FROM systems WHERE name='LZ-6SU';` returns one row whose `region_id` resolves to "Vale of the Silent".
  - `SELECT COUNT(*) FROM stars WHERE power > 0;` is non-zero and matches the `stars.csv` row count (minus warnings).
  - `SELECT COUNT(*) FROM planets;` matches `planets.csv` row count (minus warnings).
  - `SELECT COUNT(*) FROM upgrades;` matches non-blank rows in `sovUpgardes.csv`.
- Manual: open `SystemDetail` for the same system in two dock panels, tear one out into its own native window, edit the plan in either → both panels update via the broadcast event.
- Manual: trigger "Refresh data" with new sov CSVs → sov-data tables replaced, SDE tables and plan tables untouched (verified by querying `userData/app.db` before & after).
- Manual: trigger "Generate templates" → three CSVs written with the documented headers + one example row; re-importing them succeeds.
- Manual: assign upgrades to a system until a resource goes negative → SystemDetail budget bar shows the over-budget resource red, PlanInspector lists the system as unbalanced; remove an upgrade → state recovers.
- Manual: assign a producer upgrade like `Workforce Mecha-Tooling 1` (negative workforce cost) → available workforce *increases* in the rollup.
