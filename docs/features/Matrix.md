# Assignment matrix

## Purpose

One-glance, plan-wide grid: every system × every upgrade. Each cell is a green dot (todo) or solid dot (installed) when the upgrade is assigned to that system in the active plan. A "Totals" row across the top counts how many systems each upgrade appears in. Designed for spotting coverage gaps and lopsided distributions across a large plan at a glance.

## Schema

Reads via IPC only. Backed by `plan_scopes`, `plan_upgrades` (including `installed` column), `plan_system_status`, joined with the SDE hierarchy. See the SQL in `plans.matrix` IPC.

## IPC

- `plans.matrix(planId)` → `{ systems: PlanMatrixSystem[] }`. Each system carries constellation/region names, sec status, workforce status, assigned `upgrades: { name, installed }[]`, and a `usage: { power, workforce, ice, gas }` ratio object (consumed/available; `Infinity` when consumed > 0 with no available; `0` when both 0). Resource ratios are computed inline using the same balance SQL as `plans.summary`.
- `data.upgrades` — all upgrades, used to drive the column set.
- `exports.capturePng(filename, dataUrl)` — triggers PNG export (renderer-side `html2canvas` → main-side save dialog + write).
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
- **Cells are clickable** with a 3-state cycle: empty → todo (○) → installed (●) → empty. Empty stays visually blank; hover background indicates clickability. Backed by existing IPC: `plans.assignUpgrade`, `plans.setUpgradeInstalled`, `plans.removeUpgrade`. The `plan-changed` subscription refreshes after each call, so the totals row updates live.
- **Formatting bar** (checkboxes, persisted as prefs with `matrix.fmt.*` keys):
    - `colorSystems` — renders compact Power and Workforce mini-meters under the system name (shared `MiniMeter` from `src/components/MiniMeter.tsx`, also used by `PlanInspector`). Hue tracks consumed/available (green → yellow → red, `--danger` on overflow). Replaces the previous flat heat tint; raw `consumedPower / availablePower / consumedWorkforce / availableWorkforce` are surfaced on each `PlanMatrixSystem` from `plans.matrix`.
    - `upgradeSymbols` — show compact symbols from `src/data/upgradeSymbols.ts` in column headers. Mapping is currently empty (falls back to full upgrade name); intended to be populated later.
    - `verticalHeaders` — toggle 45° ↔ 90° header angle (header row height 180 px ↔ 120 px; totals-row sticky `top` follows).
    - `hideUnused` — filter `allUpgrades` to those with `totals > 0`.
    - `showInstalled` — render installed (●) vs todo (○) glyphs in cells instead of a uniform dot. Backed by `plan_upgrades.installed` (added via migration).
- **PNG export**: renderer-side `html2canvas` captures the matrix `<div>`, converts to a data URL, sends to main via `exports.capturePng(filename, dataUrl)`; main shows `dialog.showSaveDialog` and writes the file. Opsec redaction (hide names, watermark) is **not yet implemented** — see Exports.md for the planned config layer.
- `html2canvas` is added as a dependency. It is renderer-only — no ABI concerns.

## Open questions / next steps

- Drone-region column grouping or visual distinction.
- `html2canvas` scroll capture for tables wider than the viewport — may need `scrollX`/`scrollY` options.
- The workforce and power bars are supposed to be background effects of the cell.
