# Plan Inspector

## Purpose
Plan-wide rollup view. Shows totals (consumed / available per resource and total startup fuel for the plan) at the top, then groups every system in the plan by **constellation** (with region in parens) as collapsible top-level rows. Inside each constellation, every system shows its per-resource balance, an Installed/Total upgrade count, workforce-status tag, system-effect badges, and the right-click "Clear upgrades" affordance.

## Schema
Reads via IPC only. Underlying tables (used by the rollup query):

- `system_budget` view — for `available_*`.
- `plan_upgrades` joined with `upgrades` — for `consumed_*`; `GROUP_CONCAT(upgrade_name, CHAR(31))` provides the upgrade list per system; `SUM(installed)` and `COUNT(*)` provide installed/total counts.
- `plan_system_status` — for the status tag.
- `plan_scopes` — to define which systems belong to the plan even if they have no upgrades yet.

## IPC

- `plans.summary(planId)` — returns `{ planId, systemBalances: PlanRollupRow[], unbalancedSystems, totals }`. `PlanRollupRow` includes `upgrades: string[]`, `installedCount`, `totalCount`.
- `plans.removeSystem(planId, systemId)` — used by the per-row × button. Drops scope/status rows; **does not** delete `plan_upgrades` (assignments are preserved if the system is re-scoped later).
- `plans.clearUpgrades(planId, scope)` — invoked from the right-click context menu. Scope is `{ kind: 'plan' } | { kind: 'constellation', id } | { kind: 'system', id }`. The only path that deletes `plan_upgrades` rows.
- `prefs.get/set('inspector.showLocalTag')` — toggle for the LOCAL badge on local-status systems.
- Subscribes to `plan-changed` for live updates.

## Critical files

- `src/panels/PlanInspector.tsx` — group-by-constellation rendering, mini-meters, capacity indicator, effect badges, Local tag pref, Installed/Total column, right-click context menu, click-to-focus the System tab.
- `src/data/systemEffects.ts` — Stability Generator → effect (symbol + label + description) lookup.
- `src/state/uiStore.ts` — `focusPanel(panelId)` registry; `selectSystem` sets the system id.
- `src/shell/DockShell.tsx` — registers a focus callback into the store at mount.
- `electron/ipc/plans.ts` — `BALANCE_SQL_FOR_PLAN` extended with upgrade names + installed/total; `setScopes` cascade; `clearUpgrades` and `setUpgradeInstalled` handlers.

## Key decisions

- **Active-systems set** = systems explicitly/implicitly scoped ∪ systems with upgrades ∪ systems with non-local status. A system whose constellation scope is removed but which still has `plan_upgrades` rows continues to appear here — the user keeps their work.
- **`hasRemainingSpace`** triggers when the system has remaining **power AND workforce**. Ice/gas are produced inputs, not slots to fill, so they're irrelevant to "is there room for another upgrade".
- **Row highlight** (`inspector__row--over` / `inspector__dot--over`) fires only when over on Power or Workforce. Per-cell `cost-over` red text still fires for ice/gas, but the row state is governed solely by power/workforce.
- **Click-to-focus**: clicking a system row calls `selectSystem(id)` and `focusPanel('system')`. If the System tab is closed, DockShell adds it back.
- **Right-click context menu**: appears on the plan header, on each constellation header, and on each system row. Single action: "Clear upgrades for X". `confirm()` prompt before deletion — destructive and explicit.
- **Constellation scope removal cascade**: when `plans.setScopes` drops a constellation that was previously in the scope set, child `system`-scope rows for systems in that constellation are also dropped. `plan_upgrades` rows are **left alone**.
- **Effect badges**: derived from `PlanRollupRow.upgrades` via `effectsForUpgrades()`. Rendered as small inline spans after the system name. Tooltip shows the effect's full description.
- **Local tag**: gated behind `inspector.showLocalTag` pref (off by default). Toggle is a checkbox in the Inspector header.
- **Installed/Total column**: shows `installed/total` per system; turns green when complete (`installed === total > 0`). Editing happens in System Detail.
- **Sort order within a constellation**: over-budget systems first, then alphabetical by name.

## Open questions / next steps

- Region-level grouping tier above constellations (useful when a plan spans many regions).
- Workforce export/import effect on consumption — currently `transfer_amount` is not factored into balance.
- Per-system created/modified timestamps in the rollup row (deferred).
