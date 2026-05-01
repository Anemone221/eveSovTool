# Plans

## Purpose
The user's work-product. A "plan" scopes any combination of regions, constellations, and systems and stores all the upgrade assignments and per-system workforce statuses for that scope. Multiple plans coexist; one is active at a time. Plans can be duplicated to fork a "what if" without disturbing the baseline.

## Schema

- `plans(id, name UNIQUE, created_at, updated_at)`
- `plan_scopes(plan_id, scope_type IN ('region','constellation','system'), scope_id)` — composite PK.
- `plan_upgrades(plan_id, system_id, upgrade_name, ordering, notes, installed INTEGER NOT NULL DEFAULT 0)` — composite PK; FK on `upgrades(name)`.
- `plan_system_status(plan_id, system_id, status, transfer_amount INTEGER)` — workforce status; only stored when ≠ `local`.
- `plan_capital_systems(plan_id, system_id)` — see Universe.md.
- `plan_jump_bridge_links(plan_id, system_id, target_system_id, is_manual)` — see System.md.
- `plan_structures(...)` — see Structures.md.

The active plan id is persisted in `preferences` under key `plan.active.v1`.

## IPC

- `plans.list` / `plans.get(id)` / `plans.create(name)` / `plans.rename(id, name)` / `plans.delete(id)`.
- `plans.list` — extended to return `locationSummary: string` per plan (first region name, or "N regions", derived via join on `plan_scopes → systems → regions`).
- `plans.duplicate(id, newName)` — atomic clone of scopes + assignments + statuses. Source plan untouched.
- `plans.setScopes(planId, scopes[])` — replaces the scope set wholesale.
- `plans.explodeScope(planId, scopeType, scopeId)` — see Universe.md.
- `plans.assignUpgrade` / `plans.removeUpgrade` / `plans.removeSystem(planId, systemId)`.
- `plans.clearUpgrades(planId, systemId?)` — deletes all `plan_upgrades` rows for the plan (or just one system); broadcasts `plan-changed`. Uses `window.confirm()` in the renderer (permitted for destructive actions).
- `plans.setSystemStatus(planId, systemId, status, transferAmount?)`.
- `plans.setUpgradeInstalled(planId, systemId, upgradeName, installed)`.
- `plans.setCapital`, `plans.setJumpBridgeLink`, `plans.getJumpBridgeLinks` — see other docs.
- `plans.systemBalance` / `plans.summary` / `plans.matrix` — read-side rollups.
- All mutations broadcast `plan-changed` so panels refetch.

## Critical files

- `src/panels/PlansPanel.tsx` — list, create, rename, duplicate, delete, activate. Now a CSS-grid table layout with Name / Location / Created / Modified / Actions columns.
- `src/panels/PlanInspector.tsx` — `hasRemainingSpace` fix; Local tag; effect symbols.
- `src/state/uiStore.ts` — `activePlanId` zustand store; hydrates from prefs on startup.
- `src/state/useActivePlanScopes.ts` — hook used by other panels to know what's in scope.
- `electron/ipc/plans.ts` — handler implementations + the rollup SQL.

## Key decisions

- **Universe plans**, not region- or constellation-scoped — one plan can span any mix.
- Duplicate auto-suggests `<name> (copy)` and increments to `(copy 2)` etc. Rename and duplicate use inline forms with autofocus + Esc-to-cancel; no `window.prompt()`.
- `plans.delete` cascades scopes/assignments/statuses/structures/links via `ON DELETE CASCADE`.
- **`hasRemainingSpace` fix**: the `+` capacity indicator in the Inspector only fires when at least one of ice or gas is under-consumed. Power and workforce are excluded from this check — they are constraints, not "capacity" the user is trying to fill.
- **Location column**: derived in `plans.list` from the first distinct region in `plan_scopes`. If the plan has scopes in multiple regions, shows "N regions". Avoids a separate IPC call per plan.
- **Local tag**: Inspector shows a "LOCAL" badge for systems with status `local`. Gated behind a preference (`inspector.showLocalTag`) so power users can hide it.
- **Effect symbols**: `PlanRollupRow` is extended to include `upgrades: string[]`; Inspector derives symbols client-side via `upgradeSymbols.ts`. The rollup SQL must `GROUP_CONCAT` the upgrade names per system.
- **Click system to focus**: Inspector already calls `selectSystem(systemId)` on row click — this is implemented. Document, don't re-implement.
- **Remove constellation removes from plan**: when `plans.setScopes` removes a constellation scope, any `system`-type scope rows for systems in that constellation are also removed by the handler (not left as orphans).

## Open questions / next steps

- DNA export / import — plan sharing between users (see Exports.md).
- Plan diff view (compare two plans side-by-side).
- Workforce transit-chain modelling — `transfer_amount` is the schema foundation; multi-hop logic is not yet designed.
