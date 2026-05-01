# Sites overview

## Purpose
Plan-wide rollup of the anomalies the user's assignments would generate (Threat Detection arrays produce combat sites; Prospecting Arrays produce ore sites, with tier-3 Prospecting Arrays adding a Mercoxit anomaly). Top section: alphabetical totals across the plan. Below: a per-system × per-site grid with row totals, sorted by region → constellation → name. Only systems whose upgrades grant sites appear, to keep it focused.

## Schema
Reads via `plans.matrix` (same IPC as the Assignment Matrix). All site computation is done client-side from the upgrade list; there is no `sites` table.

## IPC
- `plans.matrix(planId)` — system + upgrade list per system.
- Subscribes to `plan-changed`.

## Critical files
- `src/panels/SitesOverview.tsx` — totals + grid rendering.
- `src/data/effects.ts` — `siteEffectsFor(upgradeName, sec)` and `aggregateGrants(lists)`. Encodes:
  - **Threat Detection** lookup tables for Major / Minor × tiers 1–3 across the five sec brackets `> -0.25`, `-0.45 < s ≤ -0.25`, `-0.65 < s ≤ -0.45`, `-0.85 < s ≤ -0.65`, `s ≤ -0.85`. Tables match CCP's published non-drone-region values.
  - **Prospecting Arrays** for the seven ores (Tritanium / Pyerite / Mexallon / Isogen / Nocxium / Zydrine / Megacyte) — tier N grants `Lvl N <Ore> Site`; tier 3 additionally grants `1× Mercoxit Anomaly`.

## Key decisions
- Site grants are **not** stored in the DB; they're derived from `(upgrade name, system sec)` at render time. Cheap to compute, easy to extend.
- Same matrix-style layout as Assignment Matrix: single colspan'd header cell with rotated column labels, sticky combined system column. No code is shared today but the CSS classes are (`.matrix__*`).
- "Only systems with grants" filtering keeps the view focused; if you add a Threat Detection or Prospecting Array, the system pops in automatically.

## Open questions / next steps
- Drone-region overrides — non-drone tables are applied universally today. Need a region-class lookup (drone vs non-drone) from EVE SDE, then a parallel set of tables.
- Per-site Wiki / lore links so hovering a site name explains what it is.
- Sort options: alphabetical (default) vs by total count.
