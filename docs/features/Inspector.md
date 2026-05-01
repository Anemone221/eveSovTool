# Plan Inspector

## Purpose
Plan-wide rollup view. Shows totals (consumed / available per resource and total startup fuel for the plan) at the top, then groups every system in the plan by **constellation** (with region in parens) as collapsible top-level rows. Inside each constellation, every system shows its per-resource balance, a workforce-status tag, upgrade/supercapital symbols, and ADM warning if applicable.

## Schema
Reads via IPC only. Underlying tables (used by the rollup query):

- `system_budget` view — for `available_*`.
- `plan_upgrades` joined with `upgrades` — for `consumed_*`; `GROUP_CONCAT(upgrade_name)` provides the upgrade list per system.
- `plan_system_status` — for the status tag.
- `plan_scopes` — to define which systems belong to the plan even if they have no upgrades yet.
- `system_adm_activities(system_id, activity TEXT, last_updated TEXT)` — new table; warning shown if no rows exist for a system.

## IPC

- `plans.summary(planId)` — returns `{ planId, systemBalances: PlanRollupRow[], unbalancedSystems, totals }`. `PlanRollupRow` is extended with `upgrades: string[]` (list of assigned upgrade names per system, for symbol derivation).
- `plans.removeSystem(planId, systemId)` — used by the per-row × button.
- `data.constellationSuppliers(constellationId)` — returns systems in the constellation where `available_ice > 0` or `available_gas > 0`; displayed as a "Suppliers" sub-row in the constellation header.
- `data.admActivities(systemId)` → `{ activity, lastUpdated }[]` — fetched lazily when a constellation is expanded; cached for the session. Warning icon if the result is empty.
- Subscribes to `plan-changed` for live updates.

## Critical files

- `src/panels/PlanInspector.tsx` — group-by-constellation rendering, mini-meters, capacity indicator, symbols, ADM warning, supplier sub-row.
- `src/data/upgradeSymbols.ts` — upgrade name → symbol map; used to render inline symbols on system rows.
- `electron/ipc/plans.ts` — `BALANCE_SQL_FOR_PLAN` extended to `GROUP_CONCAT` upgrade names.
- `electron/ipc/data.ts` — `data.constellationSuppliers`, `data.admActivities`.
- `electron/db/schema.ts` — `system_adm_activities` table.

## Key decisions

- Active-systems set is the union of (a) systems explicitly or implicitly scoped, (b) systems with upgrades, (c) systems with a non-local status. Newly-marked Export/Import systems show up even before they have upgrades.
- **`hasRemainingSpace`** triggers only when ice or gas is under-consumed — power and workforce are excluded (see Plans.md).
- Mini-meters at the constellation header use the same green→red usage gradient as the System detail bars.
- **Upgrade symbols**: derived from `PlanRollupRow.upgrades` via `upgradeSymbols.ts`; rendered as small inline spans after the system name. No extra IPC call per system.
- **Constellation suppliers**: fetched once per constellation when that section is first expanded. Shows e.g. "Ice: Jita, Perimeter | Gas: Jita". Uses lazy fetch + session cache to avoid loading all constellation data up-front.
- **ADM warning**: `data.admActivities` returns an empty array if no data has been imported. The UI shows a note: "Import ADM data via Data Management to populate this warning." The warning icon (⚠) only appears once data exists and is absent for a system.
- **Local tag**: systems with `status = 'local'` show a "LOCAL" badge when the `inspector.showLocalTag` pref is `'1'`. Off by default to reduce noise.
- Sort order within a constellation: unbalanced systems first, then alphabetical by system name.

## Open questions / next steps

- Region-level grouping tier above constellations (useful when a plan spans many regions).
- ADM data import UI — currently there is no way to populate `system_adm_activities`; this requires either a manual CSV import or ESI integration (see Data-Management.md).
- Click-to-expand vs. all-collapsed default behavior (preference-gated).
