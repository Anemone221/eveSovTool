# Plan Inspector

## Purpose
Plan-wide rollup view. Shows totals (consumed / available per resource and total startup fuel for the plan) at the top, then groups every system in the plan by **constellation** (with region in parens) as collapsible top-level rows. Inside each constellation, every system shows its per-resource balance and a workforce-status tag.

## Schema
Reads via IPC only. Underlying tables (used by the rollup query):

- `system_budget` view — for available_*.
- `plan_upgrades` joined with `upgrades` — for consumed_*.
- `plan_system_status` — for the status tag.
- `plan_scopes` — to define which systems belong to the plan even if they have no upgrades yet.

## IPC
- `plans.summary(planId)` — returns `{ planId, systemBalances: PlanRollupRow[], unbalancedSystems, totals }`. Each `PlanRollupRow` carries system / constellation / region names + sec status + status + the four resource pairs + startup fuel.
- `plans.removeSystem(planId, systemId)` — used by the per-row × button.
- Subscribes to `plan-changed` for live updates.

## Critical files
- `src/panels/PlanInspector.tsx` — group-by-constellation rendering, mini-meters, capacity indicator.
- `electron/ipc/plans.ts` — `BALANCE_SQL_FOR_PLAN` is the rollup query (CTE: scope_systems ∪ upgrade_systems ∪ status_systems).

## Key decisions
- Active-systems set is the union of (a) systems explicitly or implicitly scoped, (b) systems with upgrades, (c) systems with a non-local status. This way newly-marked Export/Import systems show up in the Inspector even before they have upgrades.
- Mini-meters at the constellation header use the same green→red usage gradient as the System detail bars, so the visual language is consistent.
- The capacity indicator is a single dim `+` next to balanced systems with at least one resource still under-consumed. Deliberately quiet so it doesn't compete with the over-budget red dot.
- Sort order within a constellation: unbalanced systems first, then alphabetical by system name.

## Open questions / next steps
- Region-level grouping (currently constellations are the top tier; same constellation in two adjacent regions reads cleanly enough today, but if a plan spans many regions a region tier on top would help).
- Click-to-expand vs. all-collapsed default behaviour.
