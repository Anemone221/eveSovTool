# Upgrade catalog

## Purpose
A plain reference list of every sov upgrade and its costs. Read-only — used to look up costs without opening a system, and useful when designing a plan. Filterable by name.

## Schema
- `upgrades(name PK, power, workforce, superionic_ice, magmatic_gas, startup)`. Negative values = the upgrade *produces* that resource. `startup` is one-time fuel to online.

## IPC
- `data.upgrades` — full list, sorted by name.

## Critical files
- `src/panels/UpgradeCatalog.tsx`
- `electron/ipc/data.ts` (`data.upgrades`)

## Key decisions
- Costs that are produced (negative) render in green via the `cost-produces` class, the same convention used in the System detail Available-upgrades table.
- No site-grant column today — site grants are sec-bracket dependent, and showing a representative bracket would mislead. Sites live in the Sites overview and System detail instead.
- `@tanstack/react-table` is in the dep tree but the catalog is currently a plain table; can adopt the lib if filter/sort grows.

## Open questions / next steps
- Sort column controls (currently alphabetical).
- Group by family (Threat Detection / Prospecting / Stability Generator / Workforce / Power / etc.).
- Show site grants for a chosen reference sec bracket via a dropdown.
