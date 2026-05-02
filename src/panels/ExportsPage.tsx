import { useCallback, useEffect, useMemo, useState } from 'react';
import { evesov } from '@/api/evesov';
import { OpsecPill } from '@/components/OpsecPill';
import { useUi } from '@/state/uiStore';
import {
  useOpsec,
  FLAG_KEYS,
  FLAG_LABELS,
  type OpsecFlags,
  activeFlagLabels
} from '@/state/opsecStore';
import { useExportRegistry, type ExportablePanel } from '@/state/exportRegistry';
import type { ExportLogEntry } from '@shared/index';

const PANEL_ROWS: { id: ExportablePanel; label: string; hint: string }[] = [
  { id: 'matrix', label: 'Assignment Matrix', hint: 'Per-system upgrades grid' },
  { id: 'sites', label: 'Sites Overview', hint: 'Site totals across plan' },
  { id: 'regionMap', label: 'Region Map', hint: 'Whichever region is currently displayed' }
];

export function ExportsPage(): JSX.Element {
  const activePlanId = useUi((s) => s.activePlanId);
  const focusPanel = useUi((s) => s.focusPanel);
  const flags = useOpsec((s) => s.flags);
  const preset = useOpsec((s) => s.preset);
  const setFlag = useOpsec((s) => s.setFlag);
  const applyPreset = useOpsec((s) => s.applyPreset);
  const clearAll = useOpsec((s) => s.clearAll);
  const handlers = useExportRegistry((s) => s.handlers);
  const [selected, setSelected] = useState<Record<ExportablePanel, boolean>>({
    matrix: false,
    sites: false,
    regionMap: false
  });
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<ExportLogEntry[]>([]);
  const [dnaMessage, setDnaMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const refreshLog = useCallback(async () => {
    setLog(await evesov.exports.list(activePlanId ?? null));
  }, [activePlanId]);

  useEffect(() => {
    void refreshLog();
  }, [refreshLog]);

  const triggerExport = useCallback(
    async (panel: ExportablePanel) => {
      const handler = useExportRegistry.getState().handlers[panel];
      if (!handler) {
        focusPanel(panel);
        alert(`Open the ${panel} panel first, then re-trigger the export.`);
        return;
      }
      try {
        await handler();
      } finally {
        await refreshLog();
      }
    },
    [focusPanel, refreshLog]
  );

  const onExportSelected = useCallback(async () => {
    const checked = (Object.keys(selected) as ExportablePanel[]).filter((k) => selected[k]);
    if (checked.length === 0) return;
    setBusy(true);
    try {
      for (const panel of checked) {
        await triggerExport(panel);
      }
    } finally {
      setBusy(false);
    }
  }, [selected, triggerExport]);

  const onExportDna = useCallback(async () => {
    if (activePlanId === null) return;
    try {
      const { dna } = await evesov.exports.exportDna(activePlanId);
      await navigator.clipboard.writeText(dna);
      setDnaMessage({ kind: 'ok', text: `Copied DNA to clipboard (${dna.length} chars).` });
      await refreshLog();
    } catch (err) {
      setDnaMessage({ kind: 'err', text: (err as Error).message });
    }
  }, [activePlanId, refreshLog]);

  const onImportDna = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.startsWith('ESOV1')) {
        setDnaMessage({ kind: 'err', text: 'Clipboard does not contain an ESOV1 DNA string.' });
        return;
      }
      const result = await evesov.exports.importDna(text);
      setDnaMessage({ kind: 'ok', text: `Imported plan "${result.name}" (id ${result.planId}).` });
      await refreshLog();
    } catch (err) {
      setDnaMessage({ kind: 'err', text: (err as Error).message });
    }
  }, [refreshLog]);

  const onDeleteLog = useCallback(
    async (id: number) => {
      await evesov.exports.deleteLog(id);
      await refreshLog();
    },
    [refreshLog]
  );

  const opsecActive = useMemo(() => activeFlagLabels(flags), [flags]);

  if (activePlanId === null) {
    return <div className="exports exports--empty">Activate a plan to use exports.</div>;
  }

  return (
    <div className="exports">
      <section className="exports__card" id="exports-png-card">
        <header className="exports__card-header">
          <h3>Export PNG</h3>
          <div className="exports__card-actions">
            <OpsecPill />
            <button
              type="button"
              className="exports__btn"
              disabled={busy || Object.values(selected).every((v) => !v)}
              onClick={onExportSelected}
            >
              Export selected
            </button>
          </div>
        </header>
        <table className="exports__panel-table">
          <thead>
            <tr>
              <th></th>
              <th>Panel</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {PANEL_ROWS.map((row) => {
              const mounted = Boolean(handlers[row.id]);
              return (
                <tr key={row.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected[row.id]}
                      onChange={(e) => setSelected((s) => ({ ...s, [row.id]: e.target.checked }))}
                      disabled={!mounted}
                    />
                  </td>
                  <td>
                    <div className="exports__panel-name">{row.label}</div>
                    <div className="exports__panel-hint">{row.hint}</div>
                  </td>
                  <td>
                    <span className={`exports__status exports__status--${mounted ? 'on' : 'off'}`}>
                      {mounted ? 'Mounted' : 'Open the panel first'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="exports__btn exports__btn--small"
                      disabled={!mounted || busy}
                      onClick={() => void triggerExport(row.id)}
                    >
                      Export
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="exports__card" id="exports-opsec-card">
        <header className="exports__card-header">
          <h3>Op-sec</h3>
          <div className="exports__card-actions">
            <span className="exports__preset-label">Preset:</span>
            <button
              type="button"
              className={`exports__preset${preset === 'public' ? ' exports__preset--active' : ''}`}
              onClick={() => void applyPreset('public')}
            >
              Public share
            </button>
            <button
              type="button"
              className={`exports__preset${preset === 'internal' ? ' exports__preset--active' : ''}`}
              onClick={() => void applyPreset('internal')}
            >
              Internal share
            </button>
            <button
              type="button"
              className={`exports__preset${preset === 'none' ? ' exports__preset--active' : ''}`}
              onClick={() => void clearAll()}
            >
              None
            </button>
            {preset === 'custom' && <span className="exports__preset exports__preset--active">Custom</span>}
          </div>
        </header>
        <div className="exports__opsec-grid">
          {(Object.keys(FLAG_KEYS) as (keyof OpsecFlags)[]).map((key) => (
            <label key={key} className="exports__opsec-row">
              <input
                type="checkbox"
                checked={flags[key]}
                onChange={(e) => void setFlag(key, e.target.checked)}
              />
              <span>{FLAG_LABELS[key]}</span>
            </label>
          ))}
        </div>
        <div className="exports__opsec-summary">
          {opsecActive.length === 0
            ? 'No redaction active. PNG exports will reveal full plan data.'
            : `${opsecActive.length} redaction${opsecActive.length === 1 ? '' : 's'} active.`}
        </div>
      </section>

      <section className="exports__card" id="exports-dna-card">
        <header className="exports__card-header">
          <h3>Share plan (DNA)</h3>
        </header>
        <div className="exports__dna-actions">
          <button type="button" className="exports__btn" onClick={() => void onExportDna()}>
            Export DNA → clipboard
          </button>
          <button type="button" className="exports__btn" onClick={() => void onImportDna()}>
            Import from clipboard
          </button>
        </div>
        {dnaMessage && (
          <div className={`exports__dna-message exports__dna-message--${dnaMessage.kind}`}>
            {dnaMessage.text}
          </div>
        )}
        <p className="exports__dna-hint">
          DNA strings start with <code>ESOV1</code>. Imported plans are validated against your local
          seed database; unknown systems or upgrades are rejected.
        </p>
      </section>

      <section className="exports__card" id="exports-log-card">
        <header className="exports__card-header">
          <h3>Export log</h3>
          <button type="button" className="exports__btn exports__btn--small" onClick={() => void refreshLog()}>
            Refresh
          </button>
        </header>
        {log.length === 0 ? (
          <div className="exports__log-empty">No exports yet for this plan.</div>
        ) : (
          <table className="exports__log">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Panel</th>
                <th>System</th>
                <th>File</th>
                <th>Op-sec</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {log.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.exportedAt).toLocaleString()}</td>
                  <td>{row.exportType}</td>
                  <td>{row.panel ?? '—'}</td>
                  <td>{row.systemName ?? '—'}</td>
                  <td className="exports__log-file" title={row.filename ?? ''}>
                    {row.filename ?? '—'}
                  </td>
                  <td>{row.opsecPreset ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="exports__btn exports__btn--small"
                      onClick={() => void onDeleteLog(row.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
