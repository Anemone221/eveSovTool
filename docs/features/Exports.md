# Exports

## Purpose
Centralized page for exporting plan data in various formats: PNG screenshots of the Matrix and Sites panels, a DNA string for sharing a plan with another user (PYFA-style), and map images. Includes opsec configuration to redact sensitive information before export, and a timestamped log of past exports.

## Schema

```sql
CREATE TABLE IF NOT EXISTS export_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id     INTEGER REFERENCES plans(id) ON DELETE SET NULL,
  plan_name   TEXT,
  export_type TEXT NOT NULL,
  filename    TEXT,
  exported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS export_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Opsec config keys: `opsec.hideSystemNames`, `opsec.hideRegionNames`, `opsec.hideConstellationNames`, `opsec.watermark`.

## IPC

- `exports.list()` → `ExportLogEntry[]` — recent export history.
- `exports.capturePng(filename)` — called from the renderer after `html2canvas` produces a data URL; main shows `dialog.showSaveDialog`, writes the file, appends to `export_log`.
- `exports.exportDna(planId)` → `string` — encodes the plan as a base64 DNA string; optionally saves to file via save dialog.
- `exports.importDna(dna)` → `{ planId }` — decodes and rebuilds a plan via `plans.create` + `plans.setScopes` + `plans.assignUpgrade` in a single DB transaction.
- `exports.getConfig()` → `Record<string, string>` / `exports.setConfig(key, value)` — opsec and export settings.

## Critical files

- `src/panels/ExportsPage.tsx` — export controls, opsec checkboxes, export log table.
- `electron/ipc/exports.ts` — all IPC handlers; PNG save dialog; DNA encode/decode; log writes.
- `electron/ipc/index.ts` — registers exports handlers.
- `electron/preload.ts` — exposes `exports.*`.
- `src/types/index.ts` — `ExportLogEntry`, `EveSovApi.exports.*`.
- `src/shell/DockShell.tsx` — registers ExportsPage panel.
- `src/shell/ActivityBar.tsx` — adds Exports item.
- `electron/db/schema.ts` — `export_log`, `export_config` tables.

## Key decisions

- **PNG capture** is renderer-side: `html2canvas` captures the target panel element and returns a data URL. The renderer sends the data URL to `exports.capturePng` in main; main handles the save dialog and disk write. This keeps the file-system access in the main process while letting html2canvas operate in the renderer DOM.
- **Opsec redaction** is applied in the renderer before `html2canvas` runs: system/region/constellation names are replaced with generic labels ("System-1", "Region-A", etc.) in the component's local state, the capture runs, then state is restored. No permanent data change.
- **DNA format**: `base64(JSON.stringify({ v: 1, name: string, scopes: PlanScope[], upgrades: { systemId, upgradeName, installed }[] }))`. The decoder calls existing IPC in sequence — not a new import path.
- `export_log` uses `ON DELETE SET NULL` for `plan_id` so the log entry survives plan deletion, with `plan_name` as a snapshot for display.
- `html2canvas` is a renderer-only dependency (no native ABI). Add to `dependencies`, not `devDependencies`.

## Open questions / next steps

- Map image export — requires a canvas-based universe map renderer; deferred.
- Full opsec audit: ensure DNA strings don't leak redacted names (encode IDs, not names, in the DNA payload).
- Import DNA from file picker as well as clipboard paste.
