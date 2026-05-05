# Settings

## Purpose
The catch-all settings surface for the app. A single `SettingsPage` panel with three tabs — **General**, **Preferences**, **Data** — covering theme/palette, default open panels, API sync controls, upgrade-value editing, system resource overrides, CSV re-import, and purge controls.

This feature absorbs what was previously planned as a standalone Data Management panel. There is no separate DataManagementPage — its contents live in the Settings → Data tab. See [Data-Management.md](Data-Management.md) for the deeper schema/IPC spec backing that tab.

## Schema
No new tables for settings themselves; everything persists via the existing `preferences` table under `settings.*` keys. Tables consumed by the Data tab (`upgrades_seed`, `system_adm_activities`, market-data table) are documented in [Data-Management.md](Data-Management.md).

`settings.*` pref keys:

General
- `settings.theme` → `'abyss' | 'caldari' | 'high-contrast'` (default `'abyss'`)
- `settings.color.<token>` → hex string (e.g. `settings.color.accent` → `'#4a90d9'`)
- `settings.marketSync.enabled` → boolean (master kill switch)

Preferences
- `settings.defaultPanels` → JSON array of panel ids (subset of `ACTIVITY_PANELS` in [src/shell/ActivityBar.tsx](../../src/shell/ActivityBar.tsx)). Empty = restore last layout (current behavior).

Data
- `settings.dataSync.market.enabled` → boolean
- `settings.dataSync.sov.enabled` → boolean
- `settings.dataSync.intervalMode` → `'startup' | '60m' | '5h' | '1d'`
- `settings.dataSync.lastSync.<source>` → ISO timestamp, written by sync jobs when they ship; UI shows "Never" if absent.

## IPC
- Reuses `prefs.get` / `prefs.set` for all settings persistence.
- New `prefs.deletePrefix(prefix)` for the "Reset program defaults" button.
- The Data tab consumes every channel in [Data-Management.md](Data-Management.md) (`data.updateUpgrade`, `data.resetUpgrade`, `data.updateSystemResource`, `data.refreshSov`, `data.exportTemplates`, `data.purgeMarketData`, `data.hasMarketData`, `data.importAdmActivities`) plus new purge channels: `data.purgeStations`, `data.purgeMoonScans`, `plans.purgeAll`, `plans.purgeAllUpgrades`.

## Critical files

- `src/panels/SettingsPage.tsx` — tabbed shell with `GeneralSection` (theme picker + per-token color overrides + market-sync master toggle + reset-defaults) and `PreferencesSection` (default-panels picker). Data section is still a placeholder.
- `src/state/theme.ts` — `THEMES`, `COLOR_TOKENS`, `hydrateTheme`, `applyTheme`, `setTheme`, color-override helpers.
- `src/shell/defaultPanels.ts` — `DEFAULT_PANELS_KEY` and `parseDefaultPanels` (validates against `ACTIVITY_PANELS`).
- `src/shell/ActivityBar.tsx` — exports `ACTIVITY_PANELS` and `ACTIVITY_LABELS`; adds Settings item (gear glyph) as the only data/config entrypoint; no separate Data Management item.
- `src/shell/DockShell.tsx` — registers `settingsPage` component and `settings` panel definition; reads `settings.defaultPanels` after layout restore and opens any listed panels not already present.
- `src/styles.css` — per-theme `:root[data-theme="…"]` token blocks (`abyss` / `caldari` / `high-contrast`); `.settings`, `.settings__tabs`, `.settings__tab`, `.settings__panel`, `.settings__row`, `.settings__group`, `.settings__panel-list` blocks.
- `src/App.tsx` — hydrates theme + color overrides on mount via `hydrateTheme`.
- `electron/ipc/prefs.ts` — adds `prefs.deletePrefix`.
- `electron/ipc/data.ts`, `electron/ipc/plans.ts` — new purge handlers; full Data-tab IPC surface (pending).
- `electron/preload.ts`, `src/types/index.ts` — expose and type new channels.

## Key decisions

- **Single page, three tabs.** Settings is the umbrella; Data Management is merged in rather than living as a peer panel. Avoids duplicate entrypoints and keeps "where do I change X?" answerable in one place.
- **Theme application.** `data-theme` attribute on `<html>` drives per-theme CSS custom property overrides. Theme change is immediate (no reload). Custom color overrides applied on `document.documentElement.style` after the theme attribute, so they take precedence.
- **Hydration order on startup**: (1) set `data-theme` from `settings.theme`, (2) apply `settings.color.*` overrides, (3) restore Dockview layout, (4) ensure `settings.defaultPanels` are open. All before first interaction to avoid flashes.
- **Master vs per-source sync toggles.** `settings.marketSync.enabled` is the kill switch; per-source toggles in the Data tab are AND-ed with it.
- **Reset program defaults.** `prefs.deletePrefix('settings.')`, then re-apply theme attribute and reload. Layout/active-plan prefs (under `dock.*`) are not touched.
- **Purges** use `window.confirm()` (allowed per CLAUDE.md) and broadcast `data-refreshed` / `plan-changed` so other panels re-fetch.

## Open questions / next steps

- [x] Add `prefs.deletePrefix` IPC and wire to Reset Defaults.
- [x] Implement General tab — theme picker + custom colors (Accent / Success / Danger), master market-sync toggle, "Reset program defaults".
- [x] Implement Preferences tab — multi-select default open panels (`settings.defaultPanels`), wired into DockShell startup after layout restore.
- [ ] Implement Data tab — Sync subsection: per-source toggles (Market, Sov), interval radio (`startup` / `60m` / `5h` / `1d`), per-source "Last sync" display ("Never" until Data Sync ships).
- [ ] Implement Data tab — Upgrades editor table with inline edits, per-row reset (requires `upgrades_seed` shadow table; see Data-Management.md).
- [ ] Implement Data tab — System resource overrides (system search → editable star power, per-planet power/workforce).
- [ ] Implement Data tab — CSV re-import UI over `data.refreshSov` with inline import report.
- [ ] Implement Data tab — Purge group: Market Data (gated on `data.hasMarketData()`), All Plans, All Plan Upgrades, Stations, Moon Scan Data.
- [ ] Add `data.purgeStations`, `data.purgeMoonScans`, `plans.purgeAll`, `plans.purgeAllUpgrades` IPC handlers.
- [ ] Update [Data-Management.md](Data-Management.md) with a header note that it lives inside the Settings → Data tab.
- [ ] Update [INDEX.md](INDEX.md) row for Settings to mention default panels, sync, and data management; update Data-Management row to "schema/IPC for the Settings → Data tab".
- [ ] Expand custom-color tokens beyond Accent / Success / Danger (e.g. background and foreground tokens).
- [ ] Future: export / import theme as a JSON preset for sharing.
- [ ] Future: per-panel color overrides (e.g. different accent in Matrix vs Inspector).
- [ ] Future: SDE refresh flow once a re-importable SDE pipeline exists.
