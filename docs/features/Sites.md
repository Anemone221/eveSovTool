# Sites overview

## Purpose
Plan-wide rollup of the anomalies the user's assignments would generate (Threat Detection arrays produce combat sites; Prospecting Arrays produce ore sites, with tier-3 Prospecting Arrays adding a Mercoxit anomaly). Top section: alphabetical totals across the plan. Below: a per-system × per-site grid with row totals, sorted by region → constellation → name. Only systems whose upgrades grant sites appear, to keep it focused.

## Schema
Reads via `plans.matrix` (same IPC as the Assignment Matrix). All site computation is done client-side from the upgrade list; there is no `sites` table.

## IPC

- `plans.matrix(planId)` — system + upgrade list per system. Extended to include per-resource usage ratios (for color-system-names formatting option).
- `exports.capturePng(filename)` — PNG export (see Exports.md).
- Subscribes to `plan-changed`.

## Critical files

- `src/panels/SitesOverview.tsx` — totals + grid rendering.
- `src/data/effects.ts` — `siteEffectsFor(upgradeName, sec)` and `aggregateGrants(lists)`. Encodes:
  - **Threat Detection** lookup tables for Major / Minor × tiers 1–3 across the five sec brackets.
  - **Prospecting Arrays** for the seven ores; tier 3 adds Mercoxit anomaly.
- `src/data/upgradeSymbols.ts` — abbreviation map for upgrade labels (e.g. `'Mjr.3'`, `'Mnr.2'`).
- `src/components/FormatBar.tsx` — shared formatting checkbox bar.
- `electron/ipc/exports.ts` — `exports.capturePng`.

## Key decisions
- Site grants are **not** stored in the DB; they're derived from `(upgrade name, system sec)` at render time.
- Same matrix-style layout as Assignment Matrix: single colspan'd header cell with rotated column labels, sticky combined system column.
- **Upgrade abbreviation labels**: displayed below the system name in each row (e.g. "Mjr.3, Mnr.2"). The abbreviation map in `upgradeSymbols.ts` maps upgrade names to short codes. These labels are condensed enough to read in the system cell without widening it.
- **Formatting bar** (checkboxes, persisted as `sites.fmt.*` prefs):
  - `colorSystems` — system name background colour from worst-resource usage ratio (requires `plans.summary` cross-fetch).
  - `upgradeSymbols` — show upgrade symbols in column headers.
  - `verticalHeaders` — toggle 45° ↔ 90° header angle (same CSS approach as Matrix).
  - `showUpgradeLabels` — toggle the Mjr.3/Mnr.2 labels beneath system names.
- **PNG export**: same `html2canvas` + `exports.capturePng` approach as Matrix — captures a wrapper around both the totals list and the per-system table at full content size. Opsec redaction is not yet implemented.
- The formatting bar is the same `<FormatBar>` component as the Matrix, parameterised by the pref namespace.
- "Only systems with grants" filtering keeps the view focused.

## Open questions / next steps

- Drone-region overrides — non-drone tables applied universally today. Needs a region-class lookup from SDE.
- Per-site hover tooltip explaining what the anomaly contains.
- Sort options: alphabetical (default) vs by total count.
