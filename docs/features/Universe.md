# Universe explorer

## Purpose
The left-sidebar tree view of all of New Eden, presented as **region → constellation → system**. Lets the user filter by name, click a system to focus it in `SystemDetail`, and toggle each row in or out of the active plan's scope. Sov-eligible systems are visually distinguished from non-sov.

## Schema
Reads from the SDE-derived tables and the per-plan scope table:

- `regions(id, name, faction_id)`
- `constellations(id, region_id, name, faction_id)`
- `systems(id, constellation_id, region_id, name, security_status, security_class)`
- `system_budget` view — used for the `sov_eligible` flag on each system row.
- `plan_scopes(plan_id, scope_type IN ('region','constellation','system'), scope_id)` — written by the scope toggle.

## IPC
- `data.tree` → returns the full hierarchy with `sovEligible` per system. Sent as one payload (~500 KB JSON for all of New Eden).
- `plans.get(planId)` — used by `useActivePlanScopes` to know which rows are explicitly scoped.
- `plans.setScopes(planId, scopes[])` — invoked by the +/✓ toggle on each row to add or remove a scope at any level.

## Critical files
- `src/panels/TreeExplorer.tsx`
- `src/state/useActivePlanScopes.ts` — derives a `Set<scopeKey>` and the `toggle()` action.
- `electron/ipc/data.ts` (`data.tree`)
- `electron/ipc/plans.ts` (`plans.setScopes`)

## Key decisions
- The tree is fetched once and rendered fully in the renderer; filter is client-side. This keeps things simple at New Eden's scale (~8500 systems). Switch to lazy/region-by-region loading if perf becomes an issue.
- A constellation/system inherits its parent's scope ("implicit" state); the toggle button is disabled in that case so the user removes scope at the parent level rather than fighting overlapping rules.
- Filter behaviour is "show the full subtree under any matching ancestor"; matching descendants of an ancestor that itself doesn't match are pruned to just the matches.

## Open questions / next steps
- Indicator on each system row showing balance state for the active plan (over budget / has remaining capacity / not in plan). Currently the only sov hint on the tree is the eligibility class.
- Multi-select for bulk scoping (right now you toggle one node at a time).
