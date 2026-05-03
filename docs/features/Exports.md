# Exports

## Purpose
Centralised dock panel for shipping a plan: PNG captures of Matrix / Sites / Region Map (individual or bulk), DNA share strings for plan portability, an op-sec layer that redacts sensitive fields before each capture, and a per-plan history of past exports.

## Schema

```sql
CREATE TABLE export_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id       INTEGER REFERENCES plans(id) ON DELETE SET NULL,
  plan_name     TEXT    NOT NULL,
  export_type   TEXT    NOT NULL,   -- 'png-matrix' | 'png-sites' | 'png-regionMap' | 'png-inspector' | 'dna-export' | 'dna-import'
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
- `exports.exportDna(planId)` → `{ dna }` — emits compact `ESOV2B` form. Logs `dna-export`.
- `exports.exportDnaText(planId)` → `{ dna }` — emits human-readable `ESOV2T` form. Logs `dna-export-text`.
- `exports.importDna(dna)` → `{ planId, name }` — accepts `ESOV1`, `ESOV2B`, or `ESOV2T`. Strict validation, all-or-nothing transaction. Logs `dna-import`. Broadcasts `plan-changed`.

## DNA formats

Three formats are recognised on import; v2 is the only one the app emits.

### `ESOV2B` (binary, default emit)

`'ESOV2B' + base64url(deflateRaw(payload))`. The deflated payload is a tagged binary stream:

```
u8 version(=2)
u8 flags                       // bit0 includeScopes, bit1 includeCapitals
varint nameLen + name (UTF-8)
varint systemCount
  per system:
    varint  systemId
    u32     stateMask          // family-packed, see slot table below
    u8      statusByte         // bit0..1 status, bit2 exportAllUnused,
                               // bit3 hasDest, bit4 hasTransfer,
                               // bit5 isCapital, bit6 hasAln, bit7 reserved
    if hasTransfer:  varint transferAmount
    if hasDest:      varint destinationSystemId
    if hasAln:       varint alnLinkedSystemId
varint scopeCount
  per scope: u8 scopeType + varint scopeId
```

**Family slot table (u32 stateMask layout, LSB→MSB):**

| Bits | Slot | States |
|---|---|---|
| 0..1 | threat-minor | 0..3 (none + tiers 1-3) |
| 2..3 | threat-major | 0..3 |
| 4..5 | prospecting-tritanium | 0..3 |
| 6..7 | prospecting-pyerite | 0..3 |
| 8..9 | prospecting-mexallon | 0..3 |
| 10..11 | prospecting-isogen | 0..3 |
| 12..13 | prospecting-nocxium | 0..3 |
| 14..15 | prospecting-zydrine | 0..3 |
| 16..17 | prospecting-megacyte | 0..3 |
| 18..19 | workforce | 0..3 |
| 20..21 | power | 0..3 |
| 22..23 | exploration-detector | 0..3 |
| 24..26 | stability | 0=none, 1=Electric, 2=Exotic, 3=Gamma, 4=Plasma |
| 27 | advanced-logistics-network | toggle |
| 28 | cynosural-navigation | toggle |
| 29 | cynosural-suppression | toggle |
| 30 | supercapital-construction | toggle |

Total bits used: 31. Two prospecting tiers in one system are unrepresentable, giving free family-exclusivity validation at decode time.

### `ESOV2T` (text)

Human-readable mirror of the binary. Header `ESOV2T v=2`, then `n=<plan>`, `scope=<type> <id>`, and per-system `sys <id>` blocks containing `up=<slot>[=<value>]`, `status=<code> [amt=N] [dest=N] [all=1]`, optional `cap`, optional `aln=<id>`. Lines are trimmed; blank lines and `#` comments ignored; unknown directives rejected.

### `ESOV2 lossiness vs `ESOV1`

`ESOV2` does **not** preserve `plan_upgrades.installed` or `plan_upgrades.ordering`. Imported upgrades are written with `installed = 1` and a fresh sequential ordering in slot-table order. Per-upgrade install state and build-queue order are deliberately out of scope; bulk install/uninstall affordances live in the UI.

### `ESOV1` (legacy, accepted on import)

`'ESOV1' + base64(JSON)` with the original payload shape `{ v: 1, n, s, u, st, cap, aln }`. Still accepted by `exports.importDna`; never emitted.

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
- [electron/ipc/exports.ts](../../electron/ipc/exports.ts) — all `exports.*` handlers; legacy v1 validator.
- [electron/data/dnaCodec.ts](../../electron/data/dnaCodec.ts) — v2 family slot table, binary + text encoders/decoders, all v2 size limits.
- [electron/preload.ts](../../electron/preload.ts), [src/types/index.ts](../../src/types/index.ts) — API surface.
- [src/panels/ExportsPage.tsx](../../src/panels/ExportsPage.tsx) — UI: PNG / DNA / Op-sec / Log cards.
- [src/state/opsecStore.ts](../../src/state/opsecStore.ts) — flags, presets (`public`, `internal`, `custom`, `none`), capture toggle.
- [src/state/exportRegistry.ts](../../src/state/exportRegistry.ts) — per-panel export handlers register here on mount; the Exports page calls them for individual or bulk export.
- [src/components/OpsecPill.tsx](../../src/components/OpsecPill.tsx), [OpsecRoot.tsx](../../src/components/OpsecRoot.tsx).
- [src/data/opsecCapture.ts](../../src/data/opsecCapture.ts), [exportFilename.ts](../../src/data/exportFilename.ts).
- [src/panels/AssignmentMatrix.tsx](../../src/panels/AssignmentMatrix.tsx), [SitesOverview.tsx](../../src/panels/SitesOverview.tsx), [RegionMap.tsx](../../src/panels/RegionMap.tsx), [PlanInspector.tsx](../../src/panels/PlanInspector.tsx) — register their export with the registry, render `<OpsecPill />`, route filenames through the shared builder.

## Key decisions

- **Single-instance capture, not off-screen mount.** The plan originally proposed mounting target panels off-screen for capture. Re-mounting heavy panels (with their own data fetches) was costly; instead live panels are captured in place. Op-sec redactions briefly flash on-screen during capture — acceptable for a dedicated export tool.
- **Op-sec is store-driven, not prop-drilled.** Hooks (`useEffectiveOpsec`) read the same store, so toggling on the Exports page changes redaction for any export entry point — including the per-panel "Export PNG" buttons.
- **Bulk export = sequential single-export loop.** Each capture still goes through the user's save dialog; for bulk, callers should expect multiple dialogs. A directory-picker variant is left as a future improvement.
- **DNA upgrade names are strings, not integer IDs.** The `upgrades` table uses `name` as primary key; introducing a surrogate int would migrate every reference. The allow-list lookup against the local table provides the same guarantee at import time. v2 still produces upgrade-name strings post-decode — the family slot table is purely a wire-format optimisation.
- **v2 drops `installed` and `ordering`.** Per-upgrade install state and queue order weren't load-bearing in shared plans; encoding them re-inflated the payload without survival value. Imports re-derive both.
- **Capture pill ≠ capture state.** The pill reflects whether redaction *is configured*, not whether a capture is currently running.

## Open questions / next steps

- Add a SystemDetail PNG row (system picker + capture).
- Bulk export with a single directory chooser instead of N save dialogs.
- Map image export (deferred — needs canvas-based universe map renderer).
- Extend text-substitution redactions: transfer-route source/destination labels, supercap upgrade column headers, gas/ice value substitution (currently CSS-hidden).
- DNA export from file picker, not just clipboard.
