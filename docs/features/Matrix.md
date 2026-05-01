# Assignment matrix

## Purpose
One-glance, plan-wide grid: every system × every upgrade. Each cell is a green dot when the upgrade is assigned to that system in the active plan. A "Totals" row across the top counts how many systems each upgrade appears in. Designed for spotting coverage gaps and lopsided distributions across a large plan at a glance.

## Schema
Reads via IPC only. Backed by `plan_scopes`, `plan_upgrades`, `plan_system_status`, joined with the SDE hierarchy (`systems` / `constellations` / `regions`). See the SQL in `plans.matrix` IPC.

## IPC
- `plans.matrix(planId)` → `{ systems: PlanMatrixSystem[] }`. Each system carries its constellation/region names, sec status, workforce status, and the array of assigned upgrade names.
- `data.upgrades` — all upgrades, used to drive the column set.
- Subscribes to `plan-changed` for live updates.

## Critical files
- `src/panels/AssignmentMatrix.tsx`
- `electron/ipc/plans.ts` (`plans.matrix`)

## Key decisions
- **Column headers are rotated −45°** (bottom-left → upper-right). To make this work without the next column's background painting over the previous label, every column header lives inside a single colspan'd `<th>` containing a flex row of 30 px slots; rotated `<span>`s are absolutely positioned within each slot. Sibling cells can no longer overlap because there are no siblings.
- The system column is sticky on the left and stacks the system name on top with `<constellation> / <region>` underneath as a smaller dim line — this avoids the dual-sticky-column overlap problem (no hardcoded `left:` offset for a second sticky column).
- The "Totals" row sticks at `top: 180px` so it stays visible just below the rotated header during vertical scroll.
- Subtle 1 px column dividers (`rgba(255,255,255,0.05)`) so the eye can scan across many columns.

## Open questions / next steps
- Filter / dim columns to "only assigned upgrades" for plans that touch a small subset of the catalogue.
- Cell click → open the System detail with that upgrade scrolled into the Available list.
