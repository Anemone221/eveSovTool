# Assignment matrix

## Purpose

One-glance, plan-wide grid: every system × every upgrade. Each cell is a green dot (todo) or solid dot (installed) when the upgrade is assigned to that system in the active plan. A "Totals" row across the top counts how many systems each upgrade appears in. Designed for spotting coverage gaps and lopsided distributions across a large plan at a glance.

## Schema

Reads via IPC only. Backed by `plan_scopes`, `plan_upgrades` (including `installed` column), `plan_system_status`, joined with the SDE hierarchy. See the SQL in `plans.matrix` IPC.

## IPC

- `plans.matrix(planId)` → `{ systems: PlanMatrixSystem[] }`. Each system carries constellation/region names, sec status, workforce status, assigned upgrade names, and per-upgrade `installed` flags. Extended to include per-resource usage ratios for color-coding.
- `plans.summary(planId)` — fetched in parallel to provide resource usage ratios per system (for color-system-names formatting option).
- `data.upgrades` — all upgrades, used to drive the column set.
- `exports.capturePng(filename)` — triggers PNG export (see Exports.md).
- Subscribes to `plan-changed` for live updates.

## Critical files

- `src/panels/AssignmentMatrix.tsx`
- `src/components/FormatBar.tsx` — shared formatting checkbox bar (also used by Sites).
- `electron/ipc/plans.ts` (`plans.matrix` extended with `installed` and usage ratios)
- `electron/ipc/exports.ts` — `exports.capturePng`

## Key decisions

- **Column headers are rotated −45°** (bottom-left → upper-right). Every column header lives inside a single colspan'd `<th>` with absolutely-positioned rotated `<span>`s. A toggle switches to 90° (`transform: rotate(-90deg)`) — header row height adjusts accordingly (180 px → 120 px).
- The system column is sticky on the left with the system name stacked over `<constellation> / <region>`.
- The "Totals" row sticks at `top: 180px`. If sticking breaks, the likely cause is the `overflow: auto` scroll context — verify `border-collapse: separate` is set and the sticky parent is the scroll container, not a wrapper.
- **Formatting bar** (checkboxes, persisted as prefs with `matrix.fmt.*` keys):
  - `colorSystems` — system name cell background colour reflects worst-resource usage ratio (green → red); requires `plans.summary` data.
  - `upgradeSymbols` — show compact symbols from `upgradeSymbols.ts` in column headers.
  - `verticalHeaders` — toggle 45° ↔ 90° header angle.
  - `hideUnused` — filter `allUpgrades` to those with `totals > 0`.
  - `showInstalled` — render installed (●) vs todo (○) glyphs in cells instead of a uniform dot.
- **PNG export**: renderer-side `html2canvas` captures the matrix `<div>`, converts to a data URL, sends to main via `exports.capturePng`; main shows `dialog.showSaveDialog` and writes the file. Opsec config (hide names) is applied before capture (see Exports.md).
- `html2canvas` is added as a dependency. It is renderer-only — no ABI concerns.

## Open questions / next steps

- Cell click → open System detail scrolled to that upgrade in the Available list.
- Drone-region column grouping or visual distinction.
- `html2canvas` scroll capture for tables wider than the viewport — may need `scrollX`/`scrollY` options.
