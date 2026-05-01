# eveSovTool

A local Electron desktop tool for planning EVE Online sovereignty (SOV) upgrades against any combination of regions, constellations, and systems, using CCP's current SOV mechanics.

## Status

Phase 5 of the implementation plan. What works:

- Region → constellation → system tree (with filter, sov-eligible flag, click to select).
- System detail with planets table, star info, planning resource budget bars, and assignable upgrade list.
- Dockable panels with persisted layout (Universe, System, Plans, Plan Inspector, Upgrades).
- Multiple named "universe plans" — create / rename / delete / activate. The active plan is remembered across launches.
- Assign / remove upgrades on a per-system basis. Resource budget validation in real time (Power, Workforce, Superionic Ice/h, Magmatic Gas/h). Producer upgrades (negative costs) increase available capacity.
- Plan Inspector with per-system balance rows, plan-wide rollups, and a one-time startup-fuel total.

Still to come: constellation/region overview panels, real OS-window tear-out, per-CSV refresh & template export, search/shortcuts polish.

## Source data

The repo currently holds the following at the project root (importers also accept a `--data` directory):

- `stars.csv`, `planets.csv`, `sovUpgardes.csv` — sov-relevant resource data.
- `mapRegions.jsonl`, `mapConstellations.jsonl`, `mapSolarSystems.jsonl`, `mapStars.jsonl` — EVE SDE crosswalk data.

## Develop

```bash
npm install          # rebuilds better-sqlite3 for Electron automatically (postinstall)
npm run seed         # produces resources/seed.db from the source files
npm run dev          # launch the app
```

The seed script runs through Electron itself (`electron electron/seed-entry.cjs`) so it shares the same native-module ABI as the running app — no manual rebuild dance needed.

On first launch, `seed.db` is copied to `%APPDATA%/eve-sov-tool/app.db` (Windows) and the app reads/writes there. Delete that file to reset to the bundled seed.

## Build

```bash
npm run build
```

Produces the production bundle under `out/`.

## Scripts

- `npm run dev` — start the app in development mode.
- `npm run build` — production build.
- `npm run seed` — rebuild `resources/seed.db` from the CSV/JSONL sources.
- `npm run rebuild` — rebuild native modules (better-sqlite3) for Electron.
- `npm run typecheck` — typecheck both Electron and renderer code.
