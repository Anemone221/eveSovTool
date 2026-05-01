# Feature docs

Each feature in the app has its own short doc here. The point is to give Claude (and future-you) a fast on-ramp: the schema it touches, the IPC channels it speaks, the files that own it, and the decisions that aren't obvious from reading the code.

**Rule of thumb:** the codebase is canonical. These docs summarise — they don't duplicate code. Keep each doc short (target under ~60 lines).

## Index

| Doc | Covers |
|---|---|
| [Universe.md](Universe.md) | Region → constellation → system tree (`TreeExplorer`) and the scope toggle. |
| [System.md](System.md) | `SystemDetail` panel: budget bars, status pill, planets, sites granted, plan upgrades, available upgrades. |
| [Plans.md](Plans.md) | `PlansPanel` + plan IPC: create / rename / duplicate / delete / activate, scopes, system status. |
| [Inspector.md](Inspector.md) | `PlanInspector`: constellation tree, mini-meters, capacity icon, remove-system. |
| [Matrix.md](Matrix.md) | `AssignmentMatrix`: rotated headers, sticky system column, totals row. |
| [Sites.md](Sites.md) | `SitesOverview` + `src/data/effects.ts`: site grants per upgrade, sec-bracket × tier lookup. |
| [Upgrades.md](Upgrades.md) | `UpgradeCatalog` plain reference table. |
| [Data-Sync-System.md](Data-Sync-System.md) | Seed pipeline, SDE / CSV importers, ABI rule, refresh-data plan. |

## Doc template

When you add or significantly change a feature, create or update its doc using these sections — in this order, omitting only what genuinely doesn't apply:

```markdown
# <Feature name>

## Purpose
One paragraph: what the feature is, who uses it, and how it fits into the app.

## Schema
Tables / columns this feature reads or writes. Reference real names from `electron/db/schema.ts`.

## IPC
Channels it consumes or exposes. Use the dotted names exactly as they appear in
`electron/preload.ts` and `electron/ipc/`.

## Critical files
Bullet list of paths owning this feature.

## Key decisions
Architectural choices a fresh reader wouldn't infer from code. Record the *why*.

## Open questions / next steps
Explicit TODO bullets. If a sub-feature is deliberately unimplemented (e.g.
"workforce route validation"), say so here so it doesn't read like an oversight.
```

## When to update

- Adding a panel, an IPC channel, or a schema table → create or update the doc in the same PR.
- Changing the *contract* of an existing IPC channel or schema column → update the doc.
- Pure refactors / styling tweaks / bug fixes → docs not required, but fix any drift you notice.
