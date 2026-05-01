# Settings

## Purpose
User-configurable UI preferences, starting with color palette / theme selection. Lets users switch between preset themes or define custom accent colors.

## Schema
No new tables. Theme preferences are stored in the existing `preferences` table under `settings.*` keys:

- `settings.theme` → `'abyss' | 'caldari' | 'high-contrast'` (default: `'abyss'`)
- `settings.color.<token>` → hex string (e.g. `settings.color.accent` → `'#4a90d9'`)

## IPC
Reuses existing `prefs.get(key)` / `prefs.set(key, value)` — no new channels.

## Critical files

- `src/panels/SettingsPage.tsx` — theme picker, custom color inputs.
- `src/styles.css` — per-theme CSS custom property blocks (`:root[data-theme="caldari"] { --bg: …; }`) and the token definitions (`--bg`, `--accent`, `--ok`, `--danger`, `--dim`, etc.).
- `src/App.tsx` (or `src/shell/DockShell.tsx`) — reads `settings.theme` pref on startup; sets `document.documentElement.setAttribute('data-theme', theme)`.
- `src/shell/ActivityBar.tsx` — adds Settings item (gear icon).

## Key decisions

- **Theme application**: a `data-theme` attribute on `<html>` drives per-theme CSS custom property overrides. No runtime style injection — just a class/attribute toggle. Theme change is immediate (no reload).
- **Preset themes**: Abyss (existing dark, default), Caldari (lighter blue-grey), High-contrast (high-contrast dark). Each is a block of CSS custom property overrides scoped to the `data-theme` value.
- **Custom colors**: `<input type="color">` per token. Values saved to `preferences` and applied by overriding the custom property on `document.documentElement.style` directly in the renderer. On startup, custom color prefs are applied after the theme attribute, so they take precedence.
- Hydration order on startup: (1) set `data-theme` from `settings.theme`, (2) apply any `settings.color.*` overrides — both happen in the app entry before first render to avoid a flash.
- No new IPC, no schema changes, no new dependencies.

## Open questions / next steps

- Export / import theme as a JSON preset for sharing.
- Per-panel color overrides (e.g. different accent in Matrix vs Inspector).
