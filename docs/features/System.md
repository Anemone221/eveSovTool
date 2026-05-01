# System detail

## Purpose
Primary editing surface for a single system within the active plan. Shows what the system has (star, planets, resource budget), what the plan has assigned to it, what it would grant (sites), and which other upgrades are still available. This is where most of the user's "doing" happens.

## Schema
Reads from:

- `systems`, `regions`, `constellations`, `stars`, `planets`, `system_budget` view — system context.
- `upgrades` — for the catalogue of assignable upgrades.
- `plan_upgrades` — the assignments for the active plan + this system.
- `plan_system_status(plan_id, system_id, status)` — workforce status (Local / Export / Import / Transit). A row only exists when the value is not `local`.

Writes via IPC; never touches SQLite directly.

## IPC
- `data.system(id)` — returns system + region + constellation + star + planets + base budget.
- `data.upgrades` — full upgrade list for the "Available upgrades" table.
- `plans.systemBalance(planId, systemId)` — returns consumed / available per resource, plus startup fuel and current `status`.
- `plans.assignUpgrade(planId, systemId, upgradeName)` → `{ ok, balance }`.
- `plans.removeUpgrade(planId, systemId, upgradeName)`.
- `plans.setSystemStatus(planId, systemId, status)`.
- `prefs.get/set` — collapse state for the Star and Planets sections (`detail.section.star`, `detail.section.planets`).
- Subscribes to `plan-changed` to refresh assignments + balance after any mutation.

## Critical files
- `src/panels/SystemDetail.tsx` — the panel itself, including the `BudgetBar` component, status pill, collapsible sections, and the Available-upgrades filter ("Only available with remaining resources" checkbox).
- `src/data/effects.ts` — `siteEffectsFor(upgradeName, sec)` and `aggregateGrants` used to render the "Sites granted in this system" section.
- `electron/ipc/plans.ts` — `plans.systemBalance`, `plans.assignUpgrade`, `plans.removeUpgrade`, `plans.setSystemStatus`.

## Key decisions
- **Reversed bars** for Superionic Ice and Magmatic Gas — they fill from the right (bar full = nothing consumed) so the visual reads "how much is left" rather than "how much is used".
- The colour gradient for every bar is driven by **usage ratio** (green at 0%, red at 100%, bright red over budget) regardless of fill direction.
- Star + Planets render side-by-side via a CSS container query when the panel is ≥ 760 px wide; below that they stack.
- Section collapse state is persisted globally (per app, not per system), so collapsing "Star" stays collapsed when you switch systems.
- "Sites granted in this system" sits between the budget and the assignments because the user thinks about *what they get* before *what they paid* once a plan is in motion.

## Open questions / next steps
- Workforce status is set but not yet wired into the budget calculation (export/import effect on consumption is TBD).
- Drone-region overrides for site grants from Threat Detection arrays — `effects.ts` currently applies the non-drone tables everywhere.
- Bulk-assign / multi-select on the Available-upgrades table.
