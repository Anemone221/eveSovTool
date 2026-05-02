# Region Map

## Purpose
Displays a dotlan-sourced SVG map of a selected region with upgrade/structure icons overlaid on each system, jump bridge lines between ALN-linked systems, and exploration aura halos. Lets planners see spatial plan state at a glance. Read-only — no editing via the map. Exports to PNG via html2canvas.

## Schema
- `regions.map_svg TEXT` — sanitized dotlan SVG, populated by the seed script. NULL until seeded or if dotlan has no map for that region.

## IPC
- `map.regionSvg(regionId)` → `string | null` — raw sanitized SVG for a region.
- `map.overlayData(planId, regionId)` → `MapOverlayData` — per-system icon flags + ALN pairs.
- `map.auraData(planId, regionId)` → `MapAuraData` — exploration aura intensity per system (BFS 5 hops from Exploration Detectors).

## Critical files
- `electron/ipc/map.ts` — IPC handlers
- `electron/sde/dotlanUrl.ts` — region name → dotlan URL
- `electron/sde/svgSanitize.ts` — strips legend, alliance text, and anchors from SVG
- `electron/db/seed.ts` — `fetchDotlanSvgs()` phase (runs after stargates import)
- `electron/db/migrations.ts` — `map_svg` column migration + backfill from seed.db
- `src/panels/RegionMap.tsx` — panel component
- `src/data/mapIcons.ts` — Vite asset imports for all overlay icons
- `src/assets/map-icons/` — icon PNGs (copied from `outside_Resources/icons/`)

## Key decisions
- **SVG stored as TEXT in `regions` table** — avoids a join and keeps queries simple; `data.tree()` only selects `id`/`name` so the large column is never read on hot paths.
- **Regex sanitization instead of DOM parser** — Node has no DOM; dotlan SVG structure from a single known author is stable enough for targeted regex surgery.
- **`dangerouslySetInnerHTML` for SVG injection** — gives direct DOM access to parse `<use>` `x`/`y` positions for overlay alignment; the SVG comes from our own seeded data, not user input.
- **Separate overlay SVG** — keeps the dotlan SVG unmodified after injection; compositing two SVGs is also what html2canvas needs for correct PNG export.
- **Aura intensity via opacity** — each system accumulates a count of Exploration Detectors within 5 hops; opacity = `min(count * 0.10, 0.55)`. Overlapping auras are naturally darker.
- **Fetch only sov-eligible regions during seed** — reduces dotlan requests to regions that matter; regions with no matching star description are skipped.
- **150ms delay between dotlan fetches** — respectful to the community fansite server.

## Open questions / next steps
- Clicking a system on the map could select it in the Tree / SystemDetail panel.
- Region selector could be filtered to only regions in the active plan's scopes (requires fetching plan scopes in the panel).
- Dotlan SVG format changes would require updating `svgSanitize.ts`.
