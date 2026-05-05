# Plans

## Purpose

The user's work-product. A "plan" scopes any combination of regions, constellations, and systems and stores all the upgrade assignments and per-system workforce statuses for that scope. Multiple plans coexist; one is active at a time. Plans can be duplicated to fork a "what if" without disturbing the baseline.

## Schema

- `plans(id, name UNIQUE, created_at, updated_at)`
- `plan_scopes(plan_id, scope_type IN ('region','constellation','system'), scope_id)` — composite PK.
- `plan_upgrades(plan_id, system_id, upgrade_name, ordering, notes, installed INTEGER NOT NULL DEFAULT 0)` — composite PK; FK on `upgrades(name)`. `installed` added via guarded `ALTER TABLE` migration in `electron/db/connection.ts`.
- `plan_system_status(plan_id, system_id, status)` — workforce status; only stored when ≠ `local`.

The active plan id is persisted in `preferences` under key `plan.active.v1`.

## IPC

- `plans.list` / `plans.get(id)` / `plans.create(name)` / `plans.rename(id, name)` / `plans.delete(id)`.
- `plans.duplicate(id, newName)` — atomic clone of scopes + assignments (including `installed`) + statuses. Source plan untouched.
- `plans.setScopes(planId, scopes[])` — replaces the scope set; cascades on dropped region/constellation scopes (see Key decisions).
- `plans.assignUpgrade` / `plans.removeUpgrade`.
- `plans.removeSystem(planId, systemId)` — drops the explicit system scope and the workforce-status row. **Does not** delete `plan_upgrades` — assignments are preserved if the user re-scopes the system later.
- `plans.clearUpgrades(planId, scope)` — `scope` is `{ kind: 'plan' } | { kind: 'constellation', id } | { kind: 'system', id }`. The only path that deletes `plan_upgrades` rows. Renderer prompts via `confirm()` since this is destructive.
- `plans.setSystemStatus(planId, systemId, status)`.
- `plans.setUpgradeInstalled(planId, systemId, upgradeName, installed)` — toggles the per-row installed flag.
- `plans.systemBalance` / `plans.summary` / `plans.matrix` — read-side rollups. `summary` returns `installedCount`, `totalCount`, and `upgrades: string[]` per system.
- All mutations broadcast `plan-changed` so panels refetch.

## Critical files

- `src/panels/PlansPanel.tsx` — list, create, rename, duplicate, delete, activate.
- `src/panels/PlanInspector.tsx` — see Inspector.md.
- `src/state/uiStore.ts` — `activePlanId` zustand store; hydrates from prefs on startup.
- `src/state/useActivePlanScopes.ts` — hook used by other panels to know what's in scope.
- `electron/ipc/plans.ts` — handler implementations + the rollup SQL.

## Key decisions

- **Universe plans**, not region- or constellation-scoped — one plan can span any mix.
- Duplicate auto-suggests `<name> (copy)` and increments to `(copy 2)` etc. Rename and duplicate use inline forms with autofocus + Esc-to-cancel; no `window.prompt()`.
- Rename is reachable two ways: double-click the plan name, or click the explicit ✎ button on the row. Both routes share the same `renamingId` state.
- The plan list shows two date columns (Created / Modified) under a header row aligned via CSS grid (`grid-template-columns: 1fr 110px 110px auto auto auto`).
- Plan delete uses an inline two-step confirmation (× → Delete + Cancel) rather than a native `confirm()` dialog. Starting a rename or duplicate clears any pending delete confirm so only one row-level action is "armed" at a time.
- The Electron window title mirrors the active plan: `${plan.name} — eveSov`, or just `eveSov` when no plan is active. DockShell sets `document.title` in a `useEffect` keyed on `activePlanId` and on `plan-changed` events; no main-process IPC is involved (Electron auto-syncs from `document.title`).
- `plans.delete` cascades scopes/assignments/statuses via `ON DELETE CASCADE`.
- **`hasRemainingSpace`**: the `+` capacity indicator fires when the system has remaining **power AND workforce**. Ice and gas are produced inputs, not slots to fill — irrelevant to this check.
- **Row highlight rule**: in the Inspector, `inspector__row--over` and the dot indicator fire only when over on Power or Workforce. Per-cell red text still applies to all four resources.
- **Setting scopes cascades**: when `plans.setScopes` drops a constellation that was previously scoped, child `system`-scope rows for systems in that constellation are also dropped. Same for region drops (cascades to constellations and systems). `plan_upgrades` rows are **never** touched by this cascade — only by `plans.clearUpgrades`.
- **`removeSystem` keeps upgrades**: removing a system from the plan (× button on the Inspector row) drops the explicit system scope and workforce status row, but the system's `plan_upgrades` rows remain. The user can re-scope and recover the work.
- **`clearUpgrades` is the only deletion path** for `plan_upgrades` (apart from `plans.delete` cascading the whole plan). Triggered from the right-click context menu in the Inspector at plan, constellation, or system scope.
- **Local tag**: Inspector shows a "LOCAL" badge for systems with status `local`. Gated behind `inspector.showLocalTag` (off by default).
- **Effect symbols**: `PlanRollupRow.upgrades: string[]` is populated via `GROUP_CONCAT(upgrade_name, CHAR(31))` and split client-side. `src/data/systemEffects.ts` maps Stability Generator names to effect badges.
- **Click system to focus**: clicking a system in the Inspector calls both `selectSystem(id)` and `focusPanel('system')`. DockShell registers a focus callback into `useUi` at mount; clicking re-opens the System tab if it was closed.

## Open questions / next steps

- Plan diff view (compare two plans side-by-side).
