# eveSovTool — assistant working notes

This file is the working agreement for any AI coding assistant (Claude in particular) operating in this repo. Read it before touching code.

## Project at a glance

A local-only Electron + React + TypeScript desktop app for planning EVE Online sovereignty (sov) upgrades. No network calls, no telemetry. Built with `electron-vite`, packaged eventually as a Windows `.exe`. Source-of-truth data is SQLite (better-sqlite3) seeded from CSVs (sov data) and JSONLs (EVE SDE crosswalk). Licensed GPL-3.0.

## Where to look first

1. **`docs/features/INDEX.md`** — feature docs, indexed. Always check here before exploring code or planning a feature change. Each feature doc names the schema, IPC, and critical files.
2. **`README.md`** — public-facing project page; canonical "what works today" lives in its Status section.
3. **`we-are-building-a-sharded-lemur.md`** — rolling implementation plan / roadmap.
4. **The codebase is the source of truth.** If a doc disagrees with code, fix the doc.

## Project layout

```
eveSovTool/
├── electron/                      # main + preload (Node side)
│   ├── main.ts                    # bootstrap, window lifecycle, IPC registration
│   ├── preload.ts                 # contextBridge surface (window.evesov)
│   ├── seed-entry.cjs             # entrypoint when seeding via Electron's runtime
│   ├── csv/importer.ts            # CSV → sov-data tables
│   ├── sde/importer.ts            # JSONL → SDE tables (regions/constellations/systems)
│   ├── db/
│   │   ├── schema.ts              # CREATE TABLE IF NOT EXISTS … (idempotent)
│   │   ├── connection.ts          # better-sqlite3 handle + pragmas
│   │   ├── userDb.ts              # copies seed.db → userData/app.db on first run
│   │   └── seed.ts                # CLI entry: `npm run seed`
│   └── ipc/
│       ├── index.ts               # registers data + prefs + plans handlers
│       ├── data.ts                # data.* channels
│       ├── prefs.ts               # prefs.* channels
│       └── plans.ts               # plans.* channels (incl. resource validation)
├── src/                           # renderer (React)
│   ├── main.tsx                   # entry
│   ├── App.tsx                    # mounts the DockShell
│   ├── index.html
│   ├── styles.css                 # global styles, BEM-ish
│   ├── api/evesov.ts              # typed wrapper over window.evesov
│   ├── data/effects.ts            # upgrade → site grants lookup (sec bracket × tier)
│   ├── panels/                    # one file per dock panel
│   │   ├── TreeExplorer.tsx
│   │   ├── SystemDetail.tsx
│   │   ├── PlansPanel.tsx
│   │   ├── PlanInspector.tsx
│   │   ├── AssignmentMatrix.tsx
│   │   ├── SitesOverview.tsx
│   │   └── UpgradeCatalog.tsx
│   ├── shell/
│   │   ├── DockShell.tsx          # Dockview layout + tear-out wiring
│   │   └── ActivityBar.tsx
│   ├── state/                     # zustand stores (UI-only)
│   │   ├── uiStore.ts
│   │   └── useActivePlanScopes.ts
│   └── types/index.ts             # shared DTOs + EveSovApi (consumed by preload)
├── resources/seed.db              # build artifact, bundled with the app
├── docs/features/                 # feature docs — see INDEX.md
├── outside_resources/             # source files for seeding (not bundled, not committed)
│   ├── Sov_Resources/             # stars.csv · planets.csv · sovUpgardes.csv
│   └── SDE_Resources/             # mapRegions.jsonl · mapConstellations.jsonl
│                                  # mapSolarSystems.jsonl · mapStars.jsonl
└── electron.vite.config.ts · tsconfig*.json · package.json
```

## Conventions

### Path aliases

- `@/*` → `src/*` (renderer code, `tsconfig.web.json`).
- `@shared/*` → `src/types/*` (DTOs and `EveSovApi`, used by both preload and renderer).
- Defined in `tsconfig.web.json`, `tsconfig.node.json`, and `electron.vite.config.ts`. Don't add new aliases lightly; if you do, update all three.

### IPC

- Channels are dot-separated, scoped by area: `data.*`, `plans.*`, `prefs.*`, `windows.*`. Plus `ping`.
- Register handlers in `electron/ipc/<area>.ts` and wire from `electron/ipc/index.ts`.
- Mirror new channels on `window.evesov` from `electron/preload.ts`.
- Type the wire contract in `EveSovApi` inside `src/types/index.ts` — the renderer always uses the typed wrapper from `src/api/evesov.ts`.
- After any DB mutation that changes plan state, broadcast `plan-changed` from `electron/ipc/plans.ts`. After data refresh, broadcast `data-refreshed`. Renderers subscribe via `evesov.events.on(channel, cb)` and re-fetch.

### State

- **Persistent state**: SQLite, accessed only from the main process via IPC. Survive-restart UI prefs (dock layout, active plan id, per-section collapse, etc.) live in the `preferences` table behind `prefs.get/set`.
- **Ephemeral renderer state**: `zustand` stores in `src/state/`. Keep them small; don't mirror DB state.
- One source of truth per piece of state — never duplicate something in both SQLite and a zustand store.

### CSS

- One global stylesheet at `src/styles.css`. No CSS-in-JS, no module CSS for now.
- BEM-ish naming: `.block`, `.block__element`, `.block--modifier`.
- Panel root classes match the panel name: `.detail` (SystemDetail), `.inspector` (PlanInspector), `.matrix`, `.catalog`, `.plans`, `.tree`, `.overview`. Add new modifiers under the existing block when extending a panel.
- Dockview ships its own theme CSS — we use `dockview-theme-abyss`.

### Database

- Schema is defined as a single string in `electron/db/schema.ts` and `db.exec()`'d on every open. Every statement uses `CREATE TABLE IF NOT EXISTS`, so adding a new table is a no-op on existing user DBs.
- `electron/db/userDb.ts` copies `resources/seed.db` to `app.getPath('userData')/app.db` on first launch. Delete that file to reset.
- Use named parameters (`@planId`, `@systemId`) for queries that take more than two args — see `electron/ipc/plans.ts`.
- `db.transaction(fn)` accepts only **synchronous** callbacks. Read JSONL/CSV into memory first, then run a sync transaction (see `electron/sde/importer.ts`).

### Renderer environment quirks

- **`window.prompt()` is disabled** in Electron's renderer. Always use an inline form pattern instead — `PlansPanel.tsx` is the reference (see `renamingId`/`duplicatingId` state).
- `confirm()` is allowed and used for destructive actions (delete plan, remove system).
- `alert()` works but prefer inline error rendering.

## Build & verification workflow

After every code change:

1. `npm run typecheck` — runs both the Node (`tsconfig.node.json`) and Web (`tsconfig.web.json`) projects.
2. `npx electron-vite build` — catches Vite/React/CSS issues that a pure typecheck misses.
3. For DB / importer changes: `npm run seed`, then spot-check via `sqlite3 resources/seed.db ".tables"` and a `SELECT COUNT(*)` on the affected tables.
4. For UI changes: the dev server (`npm run dev`) hot-reloads the renderer. Tell the user to reload only when you've changed `electron/main.ts`, `electron/preload.ts`, or anything else outside `src/`.

Don't claim a task is done until the build is green. Don't run UI work in CI assumptions — there's no CI configured.

## Native-module ABI rule

`better-sqlite3` is a native module. Two foot-guns to avoid:

- **Always seed via `npm run seed`**, which runs through `electron electron/seed-entry.cjs`. Running `tsx electron/db/seed.ts` directly will throw `NODE_MODULE_VERSION` mismatch errors because the binary is compiled for Electron's Node, not system Node.
- `npm install` already runs `electron-rebuild` (postinstall hook). Don't add a manual rebuild step to instructions; if a fresh install is broken, fix the postinstall, don't paper over it.

## Documentation policy

- Before exploring code or planning a feature, **check `docs/features/INDEX.md`**. Each entry summarises schema, IPC, and the critical files for that feature.
- Update or create the relevant doc in `docs/features/<Category>.md` whenever you add or significantly change a feature. The template is documented in `INDEX.md` (Purpose · Schema · IPC · Critical files · Key decisions · Open questions).
- Keep docs short. Link out to code; don't paste it. The codebase is canonical — docs only summarise.
- If you discover a doc disagrees with code while working on something else, fix it. Don't leave drift.

## Planning policy

- Use plan mode for multi-file changes or architectural decisions.
- When more than one approach is valid, present options to the user; don't decide silently.
- Break large features into phases with explicit verification steps. The implementation plan (`we-are-building-a-sharded-lemur.md`) should reflect the agreed phasing.
- Don't preemptively scaffold work that hasn't been approved.

## Code practices

- Small, purposeful diffs. Don't refactor surrounding code unless asked.
- Default to no comments. Add a comment only when *why* is non-obvious (subtle invariant, workaround for a specific bug, hidden constraint). Don't comment what well-named code already says.
- No premature abstractions. Three similar lines beat a half-baked helper.
- Don't add try/catch for cases that can't happen. Validate at boundaries (CSV ingest, IPC arguments) and trust internal callers.
- Don't add backwards-compatibility shims for in-progress code.
- When the user supplies an absolute path, use it verbatim — don't normalise or rewrite it.
- Every new IPC channel needs: handler in `electron/ipc/<area>.ts`, registration in `electron/ipc/index.ts`, exposure in `electron/preload.ts`, type in `EveSovApi`.

## Formatting

- Repo has no Prettier config; mimic the surrounding file. Conventions in current code:
  - 2-space indent, single quotes for strings, semicolons at statement ends.
  - Trailing commas in multi-line object/array/argument lists.
  - JSX uses double quotes for attributes; expressions use single quotes.
  - Imports grouped: external first, then `@/`/`@shared/`, then relative.
- After editing a file, scan it once for whitespace and import-order consistency.

## Privacy

- Do **not** include Discord usernames, real names, email addresses, or other personal attributions in code, commit messages, GitHub issues, or filenames.
- The app must remain local-only. No outbound network calls without an explicit, user-approved feature design first.

## What's open / what's done

- The README's Status section is the canonical "what works today".
- The implementation plan (`we-are-building-a-sharded-lemur.md`) is the rolling roadmap with pending phases.
- Don't claim completion of features still listed there as pending.
