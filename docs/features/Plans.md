# Plans

## Purpose
The user's work-product. A "plan" scopes any combination of regions, constellations, and systems and stores all the upgrade assignments and per-system workforce statuses for that scope. Multiple plans coexist; one is active at a time. Plans can be duplicated to fork a "what if" without disturbing the baseline.

## Schema
- `plans(id, name UNIQUE, created_at, updated_at)`
- `plan_scopes(plan_id, scope_type IN ('region','constellation','system'), scope_id)` — composite PK.
- `plan_upgrades(plan_id, system_id, upgrade_name, ordering, notes)` — composite PK; FK on `upgrades(name)`.
- `plan_system_status(plan_id, system_id, status)` — workforce status; only stored when ≠ `local`.

The active plan id is persisted in `preferences` under key `plan.active.v1`.

## IPC
- `plans.list` / `plans.get(id)` / `plans.create(name)` / `plans.rename(id, name)` / `plans.delete(id)`.
- `plans.duplicate(id, newName)` — atomic clone of scopes + assignments + (implicitly) statuses-via-scopes. Source plan untouched.
- `plans.setScopes(planId, scopes[])` — replaces the scope set wholesale.
- `plans.assignUpgrade` / `plans.removeUpgrade` / `plans.removeSystem(planId, systemId)` — last one clears upgrades + the explicit `system`-type scope row but doesn't touch parent region/constellation scopes.
- `plans.setSystemStatus(planId, systemId, status)`.
- `plans.systemBalance` / `plans.summary` / `plans.matrix` — read-side rollups (see Inspector and Matrix docs).
- All mutations broadcast `plan-changed` so panels refetch.

## Critical files
- `src/panels/PlansPanel.tsx` — list, create, rename, duplicate, delete, activate. Inline-form pattern for rename/duplicate (no `prompt()` in renderer).
- `src/state/uiStore.ts` — `activePlanId` zustand store; hydrates from prefs on startup.
- `src/state/useActivePlanScopes.ts` — hook used by other panels to know what's in scope.
- `electron/ipc/plans.ts` — handler implementations + the rollup SQL.

## Key decisions
- **Universe plans**, not region- or constellation-scoped — one plan can span any mix.
- Duplicate auto-suggests `<name> (copy)` and increments to `(copy 2)` etc. when the suggestion is taken; trims a trailing `(copy)`/`(copy N)` from the source name first so you don't get `(copy) (copy)`.
- Rename and duplicate use inline forms with autofocus + Esc-to-cancel; the renderer has no `window.prompt()`.
- `plans.delete` cascades scopes/assignments/statuses via `ON DELETE CASCADE`.

## Open questions / next steps
- Export a plan (e.g. JSON) and import elsewhere — useful for sharing between alliance members.
- Plan diff view (compare two plans side-by-side).
- Workforce import-source selection (max 3 per import system) and transit-chain modelling — schema for these isn't created yet; status field is the foundation.
