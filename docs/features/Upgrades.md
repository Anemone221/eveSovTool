# Upgrade catalog

## Purpose

A reference list of every sov upgrade and its costs. Read-only — used to look up costs without opening a system. Filterable by name. Supports a tree view grouped by category and a flat view with a type column.

## Schema

- `upgrades(name PK, power, workforce, superionic_ice, magmatic_gas, startup, category TEXT, upgrade_type TEXT, time_required INTEGER)`.
  - `category` and `upgrade_type`: populated at seed time from a static `categorizeUpgrade()` function (not from CSV). Categories: Threat Detection, Prospecting, Stability Generator, Workforce, Power, Strategic.
  - `time_required` (seconds): strategic upgrades only. Stored in DB so it is user-editable via Data Management. Seeded from `src/data/upgradeTimings.ts`.
  - Negative values = the upgrade *produces* that resource. `startup` is one-time fuel to online.

## IPC

- `data.upgrades` — full list, sorted by name; now returns `category`, `upgradeType`, `timeRequired` fields.

## Critical files

- `src/panels/UpgradeCatalog.tsx` — tree/flat toggle, collapsible category sections, time column.
- `electron/ipc/data.ts` (`data.upgrades` — include new columns in the mapper).
- `src/data/upgradeTimings.ts` — static `upgradeName → timeRequiredSeconds` map used at seed time.
- `electron/db/schema.ts` — new columns on `upgrades`.

## Key decisions

- **Tree view**: groups upgrades by `category` using controlled expand/collapse sections (same `section-toggle` button pattern as SystemDetail, not `<details>`). Each category is collapsible.
- **Flat view**: all upgrades in one table; adds a "Type" column showing `category`. Flat is the default for users unfamiliar with the category breakdown.
- **Toggle**: persisted via `prefs.get/set` under key `upgrades.view.tree` (`'1'` = tree, `'0'` = flat).
- **Category derivation**: `categorizeUpgrade(name: string)` inspects the upgrade name string — this logic already exists implicitly in `effects.ts` regex patterns. Extract it to `upgradeSymbols.ts` (or a shared utility) so it is one canonical source.
- **Time required**: shown in tree view as a "Time" column visible only for Strategic category upgrades; hidden for other categories to avoid clutter.
- Costs that are produced (negative) render in green via the `cost-produces` class, same convention as System detail.
- `@tanstack/react-table` is in the dep tree but the catalog uses a plain table. Adopt the lib only if filter/sort complexity grows significantly.

## Open questions / next steps

- Sort column controls (currently alphabetical within each category/flat view).
- Show site grants for a chosen reference sec bracket via a dropdown.
- Drone-region variant tables for Threat Detection upgrades.
