# Upgrade catalog

## Purpose

A reference list of every sov upgrade and its costs. Read-only — used to look up costs without opening a system. Filterable by name.

## Schema

- `upgrades(name PK, power, workforce, superionic_ice, magmatic_gas, startup, icon BLOB)`.
  - Negative values mean the upgrade *produces* that resource. `startup` is one-time fuel to online.
  - Categories are **not** stored in the DB — they are derived client-side from the upgrade name (see `src/data/upgradeCategories.ts`).

## IPC

- `data.upgrades` — full upgrade list, sorted by name.

## Categorization

Upgrades are bucketed into five categories used by the AssignmentMatrix and SitesOverview panels. The mapping lives in [src/data/upgradeCategories.ts](src/data/upgradeCategories.ts) (`categoryOf(name)`):

- **Strategic** — Advanced Logistics Network, Cynosural Navigation, Cynosural Suppression, Supercapital Construction Facilities.
- **Military** — Minor / Major Threat Detection Array (tiers 1–3).
- **Industry** — every Prospecting Array (seven minerals × three tiers).
- **System Upgrades** — Power Monitoring Division (1–3), Workforce Mecha-Tooling (1–3).
- **Effects** — Stability Generators (Gamma / Plasma / Electric / Exotic), Exploration Detector (1–3).

`categoryOf()` reuses `upgradeTypeKey()` from [src/types/upgradeTypes.ts](src/types/upgradeTypes.ts) so name-pattern logic stays in one place.

## Critical files

- `src/panels/UpgradeCatalog.tsx` — flat filterable table.
- `src/data/upgradeCategories.ts` — `UpgradeCategory`, `CATEGORY_ORDER`, `categoryOf()`.
- `electron/ipc/data.ts` (`data.upgrades`).
- `electron/db/schema.ts` — `upgrades` table.

## Key decisions

- Categories are derived, not stored. Avoids a migration and keeps the seed pipeline simple.
- Costs that are produced (negative) render in green via the `cost-produces` class.
- `@tanstack/react-table` is in the dep tree but the catalog uses a plain table. Adopt the lib only if filter/sort complexity grows significantly.

## Open questions / next steps

- Tree view grouping the catalog by category (Matrix and Sites already do).
- Sort column controls (currently alphabetical).
- Show site grants for a chosen reference sec bracket via a dropdown.
- Drone-region variant tables for Threat Detection upgrades.
