# eveSovTool

A local desktop tool for planning EVE Online sovereignty (sov) upgrades.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL_3.0-blue.svg)](LICENSE)
![Status: Beta](https://img.shields.io/badge/Status-Beta-blue.svg)
![Platform: Windows (Electron)](https://img.shields.io/badge/Platform-Windows-lightgrey.svg)
[![Build / Beta](https://github.com/unkwntech/eveSovTool/actions/workflows/build_beta.yml/badge.svg)](https://github.com/unkwntech/eveSovTool/actions/workflows/build_beta.yml)

---

## What it is

`eveSovTool` is an Electron desktop app for capsuleers and sov-holding alliances who want to plan, balance, and compare their sov upgrades against CCP's current sov mechanics — without standing up a spreadsheet from scratch every time. Pick any combination of regions, constellations, and systems, drop upgrades onto them, and the tool checks every system's resource budget (Power, Workforce, Superionic Ice/h, Magmatic Gas/h) against what its planets and star can supply. Plans, layouts, and preferences are stored locally; the app never uploads or downloads anything.

## Screenshots

> *Coming once the UI settles.* The activity bar gives access to: **Universe explorer**, **System detail**, **Plans**, **Plan Inspector**, **Assignment Matrix**, **Sites overview**, and **Upgrade catalog**. Panels are dockable and remember their layout between sessions.

## Features

- **Browse all of New Eden** as a region → constellation → system tree, with sov-eligible space highlighted.
- **Universe plans** — named, multiple-coexisting plans that can scope any mix of regions, constellations, and individual systems. Plans can be duplicated as `(copy)`/`(copy 2)` so you can branch a "what if" without losing your baseline.
- **Per-system budget validation** — assign upgrades and watch the four resource bars (Power / Workforce / Superionic Ice/h / Magmatic Gas/h) fill up; tooling shows you how much capacity is left and what would push a system over budget. Producer upgrades (negative costs) actually grow your available pool. One-time startup-fuel cost is tracked separately.
- **Plan Inspector** groups your scope by constellation (region in parens), with per-system balance rows and inline mini-meters showing constellation-level totals.
- **Assignment Matrix** — one-glance plan-wide grid: every system × every upgrade, with rotated headers and totals row. Supports PNG export with op-sec redaction.
- **Sites Overview** rolls up the anomalies your plan would generate (Threat Detection arrays, Prospecting Arrays — including the bonus Mercoxit anomaly on tier-3 prospectors) per system, with plan-wide totals.
- **Workforce status** per (plan, system): mark systems as Local / Export / Import / Transit ready for the workforce-routing logic.
- **Resource & site granting** is sec-bracket aware, matching CCP's published threat-detection tables.
- **Region Map** — Dotlan SVG base map overlaid with upgrade icons, structure icons, ALN bridge lines, and exploration aura; supports PNG export.
- **Structures** — track Ansiblex, Metenox, Athanor, Tatara, Sotiyo, and other structures per plan and system. Supports manual add, EVE clipboard import, and auto-generated Ansiblex cards when an ALN upgrade is assigned.
- **Moon Scans** — paste EVE moon survey clipboard data; per-moon ore composition is stored and feeds Metenox/Athanor/Tatara profitability calculations in Structures.
- **Plan DNA** — compact share strings (`ESOV2B` binary or `ESOV2T` text) for exporting and importing plans between installations. Also accepts legacy `ESOV1` imports.
- **Op-sec capture mode** — configurable redaction layer (hide system names, workforce counts, gas/ice values, supercap indicators) applied only during PNG export; live UI is unaffected.
- **Export log** — per-plan history of all PNG and DNA exports, with filename and timestamp.
- **Settings** — color palettes and theme configuration.

## Status

This project is in **beta**. Pre-built Windows installers and portable ZIPs are published automatically as GitHub Actions artifacts on every push to `main` (beta build) and on tagged releases. The data layer, plans, all core panels, exports, structures, and moon scans are working end-to-end.

What's still on the roadmap:

- Market data ingestion and structure profitability calculations.
- Workforce route validation (export ↔ import pairs and the transit chain between them).
- Real OS-window tear-out for popping panels into separate native windows.
- Per-CSV in-app refresh dialog and "Generate templates" export.
- Cross-entity search, keyboard shortcuts, drone-region site overrides.

See [`we-are-building-a-sharded-lemur.md`](we-are-building-a-sharded-lemur.md) for the full rolling implementation plan.

## Source data

The app needs three sov-data CSVs and four EVE SDE crosswalk JSONLs. Place them under `outside_resources/` before seeding:

```
outside_resources/
├── Sov_Resources/    # stars.csv · planets.csv · sovUpgardes.csv
└── SDE_Resources/    # mapRegions.jsonl · mapConstellations.jsonl
                      # mapSolarSystems.jsonl · mapStars.jsonl
```

Expected column layouts:

- `stars.csv` — `starID, regionName, System Name, Star, power`
- `planets.csv` — `planetID, Region Name, System Name, Planet Name, Power, Workforce, Superionic Ice / Hour, Magmatic Gas / Hour`
- `sovUpgardes.csv` — `Upgrade, Power, Workforce, Superionic Ice, Magmatic Gas, Startup` *(spelling preserved from CCP's source)*
- `mapRegions.jsonl`, `mapConstellations.jsonl`, `mapSolarSystems.jsonl`, `mapStars.jsonl` — from CCP's static data export.

The `outside_resources/` directory is not committed to the repo. Importers also accept a `--data <dir>` flag if you prefer a different layout. Bundling these inside a release and providing an in-app refresh / template-export dialog are tracked on the roadmap.

## Run from source

```bash
npm install          # also rebuilds better-sqlite3 for Electron via the postinstall hook
npm run seed         # produces resources/seed.db from outside_resources/
npm run dev          # launches the app
```

On first launch, `seed.db` is copied to `%APPDATA%\eve-sov-tool\app.db` and the app reads/writes there. Delete that file to reset to the bundled seed.

The seed step runs through Electron itself (`electron electron/seed-entry.cjs`) so it shares the same native-module ABI as the running app — no manual rebuild dance.

## Build

```bash
npm run build     # production bundle into out/
npm run package   # build + package into a .exe installer and portable .zip under dist/
```

GitHub Actions builds and publishes artifacts automatically:

- **Beta** (`build_beta.yml`) — runs on every push to `main`; produces `eve-sov-tool-win-installer` and `eve-sov-tool-win-portable` artifacts.
- **Release** (`build_release.yml`) — runs on pushes to the `release` tag; produces the same artifacts for stable releases.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the app in development mode (Vite + Electron). |
| `npm run build` | Production build into `out/`. |
| `npm run seed` | Rebuild `resources/seed.db` from the CSV/JSONL sources. |
| `npm run rebuild` | Rebuild native modules (`better-sqlite3`) for Electron. |
| `npm run typecheck` | Typecheck both the Electron (`tsconfig.node.json`) and renderer (`tsconfig.web.json`) projects. |

## Tech stack

- **Electron 34** + **electron-vite 3** — desktop shell + build pipeline.
- **React 18** + **TypeScript 5.9** — renderer.
- **Vite 6** — dev server / bundler.
- **better-sqlite3 12** — synchronous SQLite, embedded in the main process.
- **dockview-react 4** — dockable panel layout.
- **papaparse** — CSV parsing.
- **zustand** — small renderer-only state stores.
- **@tanstack/react-table** — used by the Upgrade catalog.

## Project layout

```
eveSovTool/
├── electron/        # main + preload (Node) — IPC, DB, importers
├── src/             # renderer (React) — panels, shell, state, types
├── resources/       # bundled assets (seed.db lives here after `npm run seed`)
├── docs/features/        # per-feature design docs (see docs/features/INDEX.md)
├── outside_resources/    # source CSVs + SDE JSONLs (not committed)
├── electron.vite.config.ts
├── tsconfig*.json
└── package.json
```

## Contributing

Issues and PRs are welcome. There is no CI configured yet, so please run `npm run typecheck` and `npm run build` locally before opening a PR.

If you're using an AI coding assistant, point it at [`Claude.MD`](Claude.MD) — that's the working agreement (path aliases, IPC patterns, build workflow, native-module ABI rule, etc.) the existing code follows.

## Privacy & data handling

- Local-only. No telemetry, no analytics, no remote calls.
- Source CSVs are supplied by the user; the app reads them off disk, writes a SQLite DB into the OS user-data folder, and that's it.
- Don't include personal attributions (Discord usernames, real names, emails) in issues or PRs.

## Disclaimer

EVE Online and the EVE logo are the registered trademarks of CCP hf. All rights are reserved worldwide. This project is not affiliated with or endorsed by CCP hf.

## License

[GPL-3.0](LICENSE).
