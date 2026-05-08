# NPC pirate-faction icons

## Purpose
Renders a small pirate-faction icon next to system names in `PlanInspector`, `TreeExplorer`, and `SystemDetail` so users can see at a glance which NPC faction (Angel, Blood Raider, Guristas, Sansha, Serpentis, Rogue Drones, Triglavian) inhabits a system's region. Visibility is toggleable via a shared preference and shown by default.

## Schema
None. The mapping is a static lookup driven by region name; no DB columns are read or written.

## IPC
None new. Reads/writes the existing `prefs.get` / `prefs.set` channels with key `ui.showNpcFactionIcons` (`'1'` shown, `'0'` hidden; missing/null → shown).

## Critical files
- [src/data/npcFactions.ts](../../src/data/npcFactions.ts) — region-name → `NpcFactionId` lookup, faction metadata (color, glyph, optional `iconPath`).
- [src/components/NpcFactionIcon.tsx](../../src/components/NpcFactionIcon.tsx) — small badge component (placeholder colored circle with glyph; swaps to `<img>` when `iconPath` is set).
- [src/panels/PlanInspector.tsx](../../src/panels/PlanInspector.tsx) — icon left of system name in the rollup table; "Show NPC faction" checkbox in the header.
- [src/panels/TreeExplorer.tsx](../../src/panels/TreeExplorer.tsx) — icon next to each system row; "NPC" toolbar toggle.
- [src/panels/SystemDetail.tsx](../../src/panels/SystemDetail.tsx) — icon next to the system title in the header.
- [src/styles.css](../../src/styles.css) — `.npc-faction-icon` block + per-faction modifier classes.

## Key decisions
- **Static map, not SDE-derived.** `regions.faction_id` only marks empire-owned space; it can't express that Heimatar/Metropolis are Angel-rat country or that Aridia is Blood Raider. The mapping is transcribed from a player-facing reference and lives entirely in `src/data/npcFactions.ts`.
- **One shared preference key (`ui.showNpcFactionIcons`).** All three panels read/write the same key. The TreeExplorer toolbar and PlanInspector header both expose toggles; flipping either affects every panel after the next mount/read.
- **Placeholder icons on purpose.** No image assets ship yet — the badge is a colored circle with a 1–2 letter glyph. To upgrade, drop image files into `src/assets/faction-icons/` and set `iconPath` in `NPC_FACTION_META`.
- **Unmapped regions render nothing.** Wormhole/Jove/etc. regions return `null` from `npcFactionForRegion`, so the icon simply doesn't render — no fallback, no console noise.

## Open questions / next steps
- Real icon assets (PNG/SVG) for the seven factions.
- Consider exposing the toggle from a single Settings location once we have a Settings hub for visual prefs.
