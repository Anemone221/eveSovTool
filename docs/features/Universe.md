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
- `plan_capital_systems(plan_id, system_id)` — marks one system per plan as Capital (Home Flag).

## IPC

- `data.tree` → returns the full hierarchy with `sovEligible` per system. Sent as one payload (~500 KB JSON for all of New Eden).
- `plans.get(planId)` — used by `useActivePlanScopes` to know which rows are explicitly scoped; also returns `capitalSystemIds: number[]`.
- `plans.setScopes(planId, scopes[])` — invoked by the +/✓ toggle on each row to add or remove a scope at any level.
- `plans.explodeScope(planId, scopeType, scopeId)` — converts a region or constellation scope into individual system scopes atomically; enables bulk-select-then-individual-remove.
- `plans.setCapital(planId, systemId, isCapital)` — marks/unmarks a system as Capital; broadcasts `plan-changed`.

## Critical files

- `src/panels/TreeExplorer.tsx`
- `src/state/useActivePlanScopes.ts` — derives a `Set<scopeKey>` and the `toggle()` action.
- `electron/ipc/data.ts` (`data.tree`)
- `electron/ipc/plans.ts` (`plans.setScopes`, `plans.explodeScope`, `plans.setCapital`)
- `electron/db/schema.ts` — `plan_capital_systems` table

## Key decisions

- The tree is fetched once and rendered fully in the renderer; filter is client-side. This keeps things simple at New Eden's scale (~8500 systems). Switch to lazy/region-by-region loading if perf becomes an issue.
- A constellation/system inherits its parent's scope ("implicit" state); the toggle button is disabled in that case so the user removes scope at the parent level rather than fighting overlapping rules.
- Filter behaviour is "show the full subtree under any matching ancestor"; matching descendants of an ancestor that itself doesn't match are pruned to just the matches.
- Sov-only filter is a boolean toggle in the renderer; it re-filters the already-loaded tree to `sovEligible === true`. No IPC change needed.
- Claimed/unclaimed sections split `sov_eligible` systems by whether they appear in `plan_scopes` (directly or via parent). Computed in the renderer from the scope state already available via `useActivePlanScopes()`.
- Count bar (total claimed, 16/36 per region) is derived from the filtered tree in the renderer. 16 and 36 are EVE's sov upgrade thresholds — keep as named constants, not magic numbers.
- `plans.explodeScope` replaces a single region/constellation scope row with one `system`-type row per child, allowing individual systems to be removed afterwards.
- Capital flag appears on the system row in the tree (Home Flag icon) and in the `SystemDetail` header. Only one capital per plan is enforced in the UI (setting a new one clears the previous), but the schema allows many (enforcement is UI-side for simplicity).
- System count shown to the right of each region/constellation label — derived from the tree data already in the renderer, no extra IPC.

## Open questions / next steps

- Balance-state indicator per system row (over budget / capacity remaining / not in plan) — currently only sov eligibility is shown.
- Right-click context menu vs inline button for Capital designation — TBD based on UX testing.
