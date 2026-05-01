# System detail

## Purpose
Primary editing surface for a single system within the active plan. Shows what the system has (star, planets, resource budget), what the plan has assigned to it, what it would grant (sites), and which other upgrades are still available. This is where most of the user's "doing" happens.

## Schema
Reads from:

- `systems`, `regions`, `constellations`, `stars`, `planets`, `system_budget` view — system context.
- `stars` also carries: `(no new columns needed — power already present)`
- `planets` — new column: `planet_type TEXT` (populated from SDE JSONL at seed time).
- `regions` — new column: `rat_type TEXT` (static mapping seeded at build time, null-sec only).
- `upgrades` — for the catalogue of assignable upgrades; new columns: `category TEXT`, `upgrade_type TEXT`, `time_required INTEGER` (seconds).
- `plan_upgrades` — the assignments for the active plan + this system; new column: `installed INTEGER NOT NULL DEFAULT 0`.
- `plan_system_status(plan_id, system_id, status, transfer_amount)` — workforce status. New column `transfer_amount INTEGER` (nullable; null means "transfer remainder").
- `plan_jump_bridge_links(plan_id, system_id, target_system_id, is_manual)` — set when ALN upgrade is assigned.
- `plan_structures(id, plan_id, system_id, structure_type, name, location, moon_id, notes, source)` — structure cards for this system.
- `systems` — new columns: `x REAL`, `y REAL`, `z REAL` (coordinates from SDE, used for jump bridge range).

Writes via IPC; never touches SQLite directly.

## IPC

- `data.system(id)` — returns system + region (with `ratType`) + constellation + star + planets (with `planetType`) + base budget.
- `data.upgrades` — full upgrade list for the "Available upgrades" table.
- `data.systemsInRange(systemId)` — returns systems within 5 LY using the EVE jump bridge range formula; used by the ALN link dropdown.
- `plans.systemBalance(planId, systemId)` — returns consumed / available per resource, startup fuel, current `status`, and `transferAmount`.
- `plans.assignUpgrade(planId, systemId, upgradeName)` → `{ ok, balance }`.
- `plans.removeUpgrade(planId, systemId, upgradeName)` — if the removed upgrade is ALN, also deletes the jump bridge link.
- `plans.setSystemStatus(planId, systemId, status, transferAmount?)`.
- `plans.setUpgradeInstalled(planId, systemId, upgradeName, installed)` — toggles the installed flag.
- `plans.setJumpBridgeLink(planId, systemId, targetSystemId | null, isManual)`.
- `plans.getJumpBridgeLinks(planId)` → `{ systemId, targetSystemId, isManual }[]`.
- `structures.list(planId, systemId)` / `structures.add` / `structures.remove` / `structures.importClipboard`.
- `prefs.get/set` — collapse state for the Star and Planets sections (`detail.section.star`, `detail.section.planets`).
- Subscribes to `plan-changed` to refresh assignments + balance after any mutation.

## Critical files

- `src/panels/SystemDetail.tsx` — the panel itself, including the `BudgetBar` component, status pill, collapsible sections, and the Available-upgrades filter.
- `src/data/effects.ts` — `siteEffectsFor(upgradeName, sec)` and `aggregateGrants`.
- `src/data/upgradeSymbols.ts` — upgrade name → symbol/abbreviation map (Cyno Beacon, Cyno Jammer, Supercapital Production, ALN; also abbreviations like `Mjr.3`).
- `src/data/piMaterials.ts` — static planet type → P0 PI materials mapping.
- `electron/ipc/plans.ts` — `plans.systemBalance`, `plans.assignUpgrade`, `plans.removeUpgrade`, `plans.setSystemStatus`, `plans.setUpgradeInstalled`, `plans.setJumpBridgeLink`, `plans.getJumpBridgeLinks`.
- `electron/ipc/data.ts` — `data.system`, `data.systemsInRange`.
- `electron/ipc/structures.ts` — structure card handlers.
- `electron/db/schema.ts` — new columns and tables listed above.
- `electron/sde/importer.ts` — must import `x`, `y`, `z` and `planet_type` from JSONL.

## Key decisions

- **Reversed bars** for Superionic Ice and Magmatic Gas — fill from the right so the visual reads "how much is left". `BudgetBar` gains a `notProduced?: boolean` prop: when `available === 0` for ice or gas, renders a grey "N/A" state instead of a 0/0 bar, since empty means the resource doesn't exist in this system.
- **Workforce transfer**: the amount field is a `<input type="number">` inline in the status pill area; a "transfer remainder" checkbox disables it and auto-fills with `available - consumed`. Validation (amount ≤ remainder) shows a red border + error `<span>` beneath the input — no `window.prompt()`.
- **Jump bridge link**: the ALN link section appears only when ALN is in the assigned list. Uses a `<select>` populated from `data.systemsInRange`; a text filter above the `<select>` narrows the list. Manual-entry checkbox enables free-text with system name autocomplete (bypasses range check; `is_manual = 1`). ALN removal deletes the link row.
- **Range formula**: `distanceLY = sqrt((ax-bx)²+(ay-by)²+(az-bz)²) / 149597870691 / 63239.6717`. Cap is 5 LY. Computed in the main process via `data.systemsInRange` (SQL math on `systems.x/y/z`).
- **Upgrade installed/todo**: a checkbox or ✓ button on each assigned upgrade row. `installed = 0` is default so existing rows are treated as todo without migration. Migration guard pattern: `PRAGMA table_info` check before `ALTER TABLE ADD COLUMN`.
- **Symbols**: derived at render time from the assigned upgrade list via `upgradeSymbols.ts`. No DB storage. Appear as a symbol row in the system header.
- **Rat types**: shown under Star only when `security_status < 0`. The `rat_type` column on `regions` is seeded from a static region→rat mapping in the seed script. Null in empire/WH space.
- **Planet type**: displayed in the planet name column (e.g. "Jita IV - Lava"). Seeded from SDE JSONL `planetTypes` data into `planets.planet_type`.
- **Structure cards**: rendered below the budget section. ALN upgrade auto-generates an Ansiblex card (`source: 'upgrade'`) when assigned. Clipboard import uses a `<textarea>` inline form. Sotiyo + Supercapital Production upgrade = Sotiyo flag on system title.
- Section collapse state is persisted globally (per app, not per system).

## Open questions / next steps

- Workforce export/import effect on budget calculation — `transfer_amount` is stored but not yet factored into the consumed/available totals.
- Drone-region overrides for site grants from Threat Detection arrays.
- Metenox/Athanor/Tatara profitability in structure cards (requires moon scan data + market prices from Data Sync — see Structures.md).
- System effects (Pulsar, Black Hole, etc.) from effect generators — needs a `system_effect` column derived from star description or a separate SDE table.
- Bulk-assign / multi-select on the Available-upgrades table.
