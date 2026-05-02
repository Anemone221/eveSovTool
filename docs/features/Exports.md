# Exports

## Purpose
Centralised dock panel for shipping a plan: PNG captures of Matrix / Sites / Region Map (individual or bulk), DNA share strings for plan portability, an op-sec layer that redacts sensitive fields before each capture, and a per-plan history of past exports.

## Schema

```sql
CREATE TABLE export_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id       INTEGER REFERENCES plans(id) ON DELETE SET NULL,
  plan_name     TEXT    NOT NULL,
  export_type   TEXT    NOT NULL,   -- 'png-matrix' | 'png-sites' | 'png-regionMap' | 'dna-export' | 'dna-import'
  panel         TEXT,
  system_name   TEXT,
  filename      TEXT,
  opsec_preset  TEXT,
  exported_at   TEXT    NOT NULL
);

CREATE TABLE export_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

`export_config` keys (`'1'`/`'0'`):
`opsec.workforce.{hidePercent,hideCount,hideVisual}`,
`opsec.power.{hidePercent,hideCount,hideVisual}`,
`opsec.{hideSupercaps,hideSystemEffects,hideTransferRoute,hideGasIceBalance,hideSystemNames}`.

## IPC

- `exports.capturePng(filename, dataUrl, meta?)` — write PNG via save dialog; if `meta.planName` is set, append an `export_log` row.
- `exports.list(planId?)` → `ExportLogEntry[]` (newest first).
- `exports.deleteLog(id)`.
- `exports.getConfig()` / `exports.setConfig(key, value)` — opsec flags.
- `exports.exportDna(planId)` → `{ dna }` — `'ESOV1' + base64(JSON)`. Logs `dna-export`.
- `exports.importDna(dna)` → `{ planId, name }` — strict validation, all-or-nothing transaction. Logs `dna-import`. Broadcasts `plan-changed`.

## DNA payload

```ts
{
  v: 1,
  n: string,                                  // plan name, [\w\s\-_.()]{1,64}
  s: [scopeTypeCode, scopeId][],              // 0=region, 1=constellation, 2=system
  u: [systemId, upgradeName, installed, ordering][],  // upgradeName must exist locally
  st?: [systemId, statusCode, transferAmount, destinationSystemId, exportAllUnused][],
  cap?: systemId[],
  aln?: [systemId, linkedSystemId][]          // linkedSystemName re-resolved at import
}
```

Encoded form: `'ESOV1' + base64(JSON.stringify(payload))`. Every numeric field is integer-bounded; the only sender-supplied string is `n` (allow-list-validated). `upgradeName` is a string but must match a row in the local `upgrades` table — same allow-list discipline.

## Import hardening

- Size caps: 256 KB raw DNA, 1 MB decoded JSON.
- `JSON.parse` only — no `eval`, no `Function`, no template execution.
- Strict tuple-arity / type / range checks (see `validateDnaPayload` in [electron/ipc/exports.ts](../../electron/ipc/exports.ts)).
- Every `systemId` / `scopeId` / `linkedSystemId` / `destinationSystemId` / capital must resolve in the local SDE tables. Every `upgradeName` must exist in the local `upgrades` table.
- Plan name allow-list `^[\w\s\-_.()]+$` rejects path separators, control chars, HTML.
- All DB writes use parameterised statements; all rendering goes through React text nodes (no `dangerouslySetInnerHTML`).
- Single `db.transaction` — any validation failure aborts before any row is written.
- Name collision: suffix `(imported)` / `(imported 2)` rather than overwrite.

## Op-sec capture mode

Op-sec flags do NOT affect live UI. They are applied only while a capture is in flight, via `withOpsecCapture` (in [src/data/opsecCapture.ts](../../src/data/opsecCapture.ts)) which sets `useOpsec.captureActive = true`, awaits two animation frames so the redacted DOM is committed, runs `html2canvas`, then resets. Each per-panel export wraps its `html2canvas` call this way.

`OpsecRoot` (in [src/components/OpsecRoot.tsx](../../src/components/OpsecRoot.tsx)) reflects the *effective* (capture-time) flags onto `<body>` as `data-opsec-*` attributes; CSS rules in [src/styles.css](../../src/styles.css) hide elements like `.matrix__system-bars`, `.status-tag`, transfer-route hints, and gas/ice deltas. Text-substitution redactions (e.g. system names → `System-N`) are component-level and consult `useEffectiveOpsec()`.

The pill (`<OpsecPill />`) is driven by the configured flags (not capture state), so it reads green whenever any redaction is queued for the next capture. Click → focuses the Exports panel.

## Filename pattern

`${planName}_${Panel}_${systemName?}_${YYYYMMDD-HHMMSS}.png` — built in [src/data/exportFilename.ts](../../src/data/exportFilename.ts), used by every PNG export.

## Critical files

- [electron/db/schema.ts](../../electron/db/schema.ts) — `export_log`, `export_config`.
- [electron/ipc/exports.ts](../../electron/ipc/exports.ts) — all `exports.*` handlers.
- [electron/preload.ts](../../electron/preload.ts), [src/types/index.ts](../../src/types/index.ts) — API surface.
- [src/panels/ExportsPage.tsx](../../src/panels/ExportsPage.tsx) — UI: PNG / DNA / Op-sec / Log cards.
- [src/state/opsecStore.ts](../../src/state/opsecStore.ts) — flags, presets (`public`, `internal`, `custom`, `none`), capture toggle.
- [src/state/exportRegistry.ts](../../src/state/exportRegistry.ts) — per-panel export handlers register here on mount; the Exports page calls them for individual or bulk export.
- [src/components/OpsecPill.tsx](../../src/components/OpsecPill.tsx), [OpsecRoot.tsx](../../src/components/OpsecRoot.tsx).
- [src/data/opsecCapture.ts](../../src/data/opsecCapture.ts), [exportFilename.ts](../../src/data/exportFilename.ts).
- [src/panels/AssignmentMatrix.tsx](../../src/panels/AssignmentMatrix.tsx), [SitesOverview.tsx](../../src/panels/SitesOverview.tsx), [RegionMap.tsx](../../src/panels/RegionMap.tsx) — register their export with the registry, render `<OpsecPill />`, route filenames through the shared builder.

## Key decisions

- **Single-instance capture, not off-screen mount.** The plan originally proposed mounting target panels off-screen for capture. Re-mounting heavy panels (with their own data fetches) was costly; instead live panels are captured in place. Op-sec redactions briefly flash on-screen during capture — acceptable for a dedicated export tool.
- **Op-sec is store-driven, not prop-drilled.** Hooks (`useEffectiveOpsec`) read the same store, so toggling on the Exports page changes redaction for any export entry point — including the per-panel "Export PNG" buttons.
- **Bulk export = sequential single-export loop.** Each capture still goes through the user's save dialog; for bulk, callers should expect multiple dialogs. A directory-picker variant is left as a future improvement.
- **DNA upgrade names are strings, not integer IDs.** The `upgrades` table uses `name` as primary key; introducing a surrogate int would migrate every reference. The allow-list lookup against the local table provides the same guarantee at import time.
- **Capture pill ≠ capture state.** The pill reflects whether redaction *is configured*, not whether a capture is currently running.

## Open questions / next steps

- Add a SystemDetail PNG row (system picker + capture).
- Bulk export with a single directory chooser instead of N save dialogs.
- Map image export (deferred — needs canvas-based universe map renderer).
- Extend text-substitution redactions: transfer-route source/destination labels, supercap upgrade column headers, gas/ice value substitution (currently CSS-hidden).
- DNA export from file picker, not just clipboard.
