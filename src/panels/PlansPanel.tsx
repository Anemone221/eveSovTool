import { useCallback, useEffect, useState } from 'react';
import { evesov } from '@/api/evesov';
import { useUi } from '@/state/uiStore';
import { siteEffectsFor } from '@/data/effects';
import type { PlanRollup, PlanRollupRow, PlanSummary, WorkforceTransfer } from '@shared/index';

interface DiffRow {
  systemId: number;
  systemName: string;
  constellationName: string;
  regionName: string;
  added: string[];
  removed: string[];
  kind: 'only-a' | 'only-b' | 'changed';
}

interface CompareSummary {
  consumedIce: number;
  consumedGas: number;
  totalSites: number;
  siteBreakdown: Map<string, number>;
}

interface TransferDiffRow {
  key: string;
  sourceName: string;
  destName: string;
  amountA: number | null;  // null = not present in this plan
  amountB: number | null;
  exportAllUnusedA: boolean;
  exportAllUnusedB: boolean;
}

interface CompareResult {
  planAName: string;
  planBName: string;
  summaryA: CompareSummary;
  summaryB: CompareSummary;
  rows: DiffRow[];
  transferDiffs: TransferDiffRow[];
}

export function PlansPanel() {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [duplicateValue, setDuplicateValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; planId: number } | null>(null);
  const [comparingFromId, setComparingFromId] = useState<number | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvImportName, setCsvImportName] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvImportError, setCsvImportError] = useState<string | null>(null);
  const [csvImportWarnings, setCsvImportWarnings] = useState<string[]>([]);
  const activePlanId = useUi((s) => s.activePlanId);
  const setActivePlan = useUi((s) => s.setActivePlan);
  const setActivePlanReadOnly = useUi((s) => s.setActivePlanReadOnly);

  const refresh = useCallback(async () => {
    const list = await evesov.plans.list();
    setPlans(list);
    const active = list.find((p) => p.id === activePlanId);
    setActivePlanReadOnly(active?.readOnly ?? false);
  }, [activePlanId, setActivePlanReadOnly]);

  useEffect(() => {
    void refresh();
    const off = evesov.events.on('plan-changed', () => {
      void refresh();
    });
    return off;
  }, [refresh]);

  useEffect(() => {
    const active = plans.find((p) => p.id === activePlanId);
    setActivePlanReadOnly(active?.readOnly ?? false);
  }, [activePlanId, plans, setActivePlanReadOnly]);

  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null); };
    window.addEventListener('mousedown', dismiss);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', dismiss);
    return () => {
      window.removeEventListener('mousedown', dismiss);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', dismiss);
    };
  }, [contextMenu]);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const plan = await evesov.plans.create(name);
    setNewName('');
    await refresh();
    setActivePlan(plan.id);
  };

  const rename = async (id: number) => {
    const name = renameValue.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    await evesov.plans.rename(id, name);
    setRenamingId(null);
    setRenameValue('');
    await refresh();
  };

  const remove = async (id: number) => {
    await evesov.plans.delete(id);
    if (activePlanId === id) setActivePlan(null);
    setConfirmingDeleteId(null);
    await refresh();
  };

  const startRename = (p: PlanSummary) => {
    setConfirmingDeleteId(null);
    setDuplicatingId(null);
    setRenameValue(p.name);
    setRenamingId(p.id);
  };

  const startDuplicate = (p: PlanSummary) => {
    setConfirmingDeleteId(null);
    setDuplicatingId(p.id);
    setDuplicateValue(uniqueCopyName(p.name, plans.map((x) => x.name)));
  };

  const commitDuplicate = async (sourceId: number) => {
    const trimmed = duplicateValue.trim();
    setDuplicatingId(null);
    setDuplicateValue('');
    if (!trimmed) return;
    const next = await evesov.plans.duplicate(sourceId, trimmed);
    await refresh();
    setActivePlan(next.id);
  };

  const cancelDuplicate = () => {
    setDuplicatingId(null);
    setDuplicateValue('');
  };

  const startCsvImport = () => {
    setCsvImportName('');
    setCsvFile(null);
    setCsvImportError(null);
    setCsvImportWarnings([]);
    setImportingCsv(true);
  };

  const cancelCsvImport = () => {
    setImportingCsv(false);
    setCsvImportName('');
    setCsvFile(null);
    setCsvImportError(null);
    setCsvImportWarnings([]);
  };

  const commitCsvImport = async () => {
    const name = csvImportName.trim();
    if (!name) { setCsvImportError('Plan name is required'); return; }
    if (!csvFile) { setCsvImportError('Select a CSV file'); return; }
    setCsvImportError(null);
    try {
      const text = await csvFile.text();
      const result = await evesov.plans.importCsv(name, text);
      setCsvImportWarnings(result.warnings);
      if (result.warnings.length === 0) {
        cancelCsvImport();
      } else {
        setImportingCsv(false);
        setCsvFile(null);
        setCsvImportName('');
      }
      await refresh();
      setActivePlan(result.planId);
    } catch (err) {
      setCsvImportError(String(err));
    }
  };

  const runComparison = useCallback(async (idA: number, idB: number) => {
    setCompareLoading(true);
    setComparingFromId(null);
    const [rollupA, rollupB, transfersA, transfersB] = await Promise.all([
      evesov.plans.summary(idA),
      evesov.plans.summary(idB),
      evesov.plans.getWorkforceTransfers(idA),
      evesov.plans.getWorkforceTransfers(idB),
    ]);
    const planAName = plans.find((p) => p.id === idA)?.name ?? `Plan ${idA}`;
    const planBName = plans.find((p) => p.id === idB)?.name ?? `Plan ${idB}`;
    setCompareResult(buildDiff(rollupA, rollupB, transfersA, transfersB, planAName, planBName));
    setCompareLoading(false);
  }, [plans]);

  const copyComparison = useCallback(() => {
    if (!compareResult) return;
    const { planAName, planBName, summaryA, summaryB } = compareResult;
    const fmt = (n: number) => n.toLocaleString();
    const delta = (a: number, b: number) => {
      const d = b - a;
      return d === 0 ? '=' : d > 0 ? `+${fmt(d)}` : fmt(d);
    };
    const lines: string[] = [
      `# Plan Comparison: ${planAName} vs ${planBName}`,
      '',
      `| | ${planAName} | ${planBName} | Δ |`,
      `|---|---|---|---|`,
      `| Superionic Ice | ${fmt(summaryA.consumedIce)}/hr | ${fmt(summaryB.consumedIce)}/hr | ${delta(summaryA.consumedIce, summaryB.consumedIce)} |`,
      `| Magmatic Gas | ${fmt(summaryA.consumedGas)}/hr | ${fmt(summaryB.consumedGas)}/hr | ${delta(summaryA.consumedGas, summaryB.consumedGas)} |`,
      `| Total Sites | ${fmt(summaryA.totalSites)} | ${fmt(summaryB.totalSites)} | ${delta(summaryA.totalSites, summaryB.totalSites)} |`,
    ];
    const allSites = [...new Set([...summaryA.siteBreakdown.keys(), ...summaryB.siteBreakdown.keys()])].sort();
    const changedSites = allSites.filter((s) => (summaryA.siteBreakdown.get(s) ?? 0) !== (summaryB.siteBreakdown.get(s) ?? 0));
    if (changedSites.length > 0) {
      for (const site of changedSites) {
        const a = summaryA.siteBreakdown.get(site) ?? 0;
        const b = summaryB.siteBreakdown.get(site) ?? 0;
        lines.push(`| ${site} | ${fmt(a)} | ${fmt(b)} | ${delta(a, b)} |`);
      }
    }
    lines.push('');
    for (const r of compareResult.rows) {
      lines.push(`## ${r.systemName} (${r.constellationName})`);
      for (const u of r.added) lines.push(`+ ${u}`);
      for (const u of r.removed) lines.push(`- ${u}`);
      lines.push('');
    }
    if (compareResult.transferDiffs.length > 0) {
      lines.push('## Workforce Transfer Changes', '');
      lines.push(`| From | To | ${planAName} | ${planBName} |`);
      lines.push(`|---|---|---|---|`);
      for (const t of compareResult.transferDiffs) {
        const fmtA = t.amountA === null ? '—' : t.exportAllUnusedA ? 'all unused' : fmt(t.amountA);
        const fmtB = t.amountB === null ? '—' : t.exportAllUnusedB ? 'all unused' : fmt(t.amountB);
        lines.push(`| ${t.sourceName} | ${t.destName} | ${fmtA} | ${fmtB} |`);
      }
      lines.push('');
    }
    void navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    });
  }, [compareResult]);
  const startDelete = (id: number) => {
    setRenamingId(null);
    setDuplicatingId(null);
    setConfirmingDeleteId(id);
  };

  const cancelDelete = () => {
    setConfirmingDeleteId(null);
  };

  return (
    <div className="plans">
      <form
        className="plans__create"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input
          type="text"
          placeholder="New plan name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" disabled={!newName.trim()}>+ Plan</button>
        <button type="button" onClick={startCsvImport} title="Import plan from CSV">Import CSV</button>
      </form>
      {importingCsv && (
        <form
          className="plans__csv-import"
          onSubmit={(e) => { e.preventDefault(); void commitCsvImport(); }}
        >
          <input
            autoFocus
            type="text"
            className="plans__csv-import-name"
            placeholder="Plan name"
            value={csvImportName}
            onChange={(e) => setCsvImportName(e.target.value)}
          />
          <input
            type="file"
            accept=".csv,text/csv"
            className="plans__csv-import-file"
            onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
          />
          <button type="submit" disabled={!csvImportName.trim() || !csvFile}>Import</button>
          <button type="button" onClick={cancelCsvImport}>Cancel</button>
          {csvImportError && (
            <span className="plans__csv-import-error">{csvImportError}</span>
          )}
        </form>
      )}
      {csvImportWarnings.length > 0 && (
        <div className="plans__csv-warnings">
          <div className="plans__csv-warnings-header">
            <span>Import warnings ({csvImportWarnings.length})</span>
            <button type="button" onClick={() => setCsvImportWarnings([])}>✕</button>
          </div>
          <ul className="plans__csv-warnings-list">
            {csvImportWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      <ul className="plans__list">
        {comparingFromId !== null && (
          <li className="plans__picker">
            <span className="plans__picker-label">
              Compare &ldquo;{plans.find((p) => p.id === comparingFromId)?.name}&rdquo; to:
            </span>
            <select
              className="plans__picker-select"
              defaultValue=""
              onChange={(e) => {
                const targetId = Number(e.target.value);
                if (targetId) void runComparison(comparingFromId, targetId);
              }}
            >
              <option value="" disabled>— pick a plan —</option>
              {plans
                .filter((p) => p.id !== comparingFromId)
                .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)
              }
            </select>
            <button
              type="button"
              className="plans__picker-cancel"
              onClick={() => { setComparingFromId(null); setCompareResult(null); }}
            >
              ✕
            </button>
          </li>
        )}
        {plans.length > 0 && (
          <li className="plans__header" aria-hidden="true">
            <span className="plans__header-name">Name</span>
            <span className="plans__header-date">Created</span>
            <span className="plans__header-date">Modified</span>
            <span className="plans__header-actions" />
          </li>
        )}
        {plans.flatMap((p) => {
          const isConfirmingDelete = confirmingDeleteId === p.id;
          const items = [
            <li
              key={p.id}
              className={`plans__row${activePlanId === p.id ? ' plans__row--active' : ''}`}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ x: e.clientX, y: e.clientY, planId: p.id });
              }}
            >
              {renamingId === p.id ? (
                <form
                  className="plans__rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void rename(p.id);
                  }}
                >
                  <input
                    autoFocus
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => setRenamingId(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                  />
                </form>
              ) : (
                <button
                  type="button"
                  className="plans__name"
                  onClick={() => setActivePlan(p.id)}
                  onDoubleClick={() => startRename(p)}
                  title="Click to activate, double-click to rename"
                >
                  {p.name}
                  {p.readOnly && <span className="plans__lock" title="Read-only — right-click to unlock">🔒</span>}
                </button>
              )}
              <span className="plans__meta plans__meta--created" title="Created">{formatDate(p.createdAt)}</span>
              <span className="plans__meta plans__meta--updated" title="Modified">{formatDate(p.updatedAt)}</span>
              <button
                type="button"
                className="plans__rename-btn"
                title="Rename plan"
                aria-label={`Rename ${p.name}`}
                onClick={() => startRename(p)}
              >
                ✎
              </button>
              <button
                type="button"
                className="plans__dup"
                title="Duplicate plan"
                aria-label={`Duplicate ${p.name}`}
                onClick={() => startDuplicate(p)}
              >
                ⎘
              </button>
              {isConfirmingDelete ? (
                <span className="plans__delete-confirm">
                  <button
                    type="button"
                    className="plans__delete plans__delete--confirm"
                    title="Confirm delete"
                    onClick={() => void remove(p.id)}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="plans__delete-cancel"
                    title="Cancel"
                    onClick={cancelDelete}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="plans__delete"
                  title="Delete plan"
                  onClick={() => startDelete(p.id)}
                >
                  ×
                </button>
              )}
            </li>
          ];
          if (duplicatingId === p.id) {
            items.push(
              <li key={`${p.id}-dup`} className="plans__dup-row">
                <form
                  className="plans__rename plans__dup-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void commitDuplicate(p.id);
                  }}
                >
                  <span className="plans__dup-label">Copy as:</span>
                  <input
                    autoFocus
                    type="text"
                    value={duplicateValue}
                    onChange={(e) => setDuplicateValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') cancelDuplicate();
                    }}
                  />
                  <button type="submit" disabled={!duplicateValue.trim()}>Copy</button>
                  <button type="button" onClick={cancelDuplicate}>Cancel</button>
                </form>
              </li>
            );
          }
          return items;
        })}
        {plans.length === 0 && <li className="plans__empty">No plans yet. Create one above.</li>}
      </ul>
      {(compareResult || compareLoading) && (
        <div className="plans__compare">
          <div className="plans__compare-header">
            <span className="plans__compare-title">
              {compareResult
                ? `${compareResult.planAName} vs ${compareResult.planBName}`
                : 'Loading comparison…'}
            </span>
            {compareResult && (
              <button
                type="button"
                className="plans__compare-copy"
                title="Copy as markdown"
                onClick={copyComparison}
              >
                {copyFeedback ? 'Copied!' : 'Copy'}
              </button>
            )}
            <button
              type="button"
              className="plans__compare-close"
              onClick={() => { setCompareResult(null); setComparingFromId(null); setCompareLoading(false); }}
            >
              ✕
            </button>
          </div>
          {compareLoading && <div className="plans__compare-loading">Loading…</div>}
          {compareResult && (
            <>
              <table className="plans__compare-summary">
                <thead>
                  <tr>
                    <th></th>
                    <th>{compareResult.planAName}</th>
                    <th>{compareResult.planBName}</th>
                    <th>Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ['Superionic Ice', compareResult.summaryA.consumedIce, compareResult.summaryB.consumedIce, '/hr'],
                    ['Magmatic Gas',   compareResult.summaryA.consumedGas,  compareResult.summaryB.consumedGas,  '/hr'],
                    ['Total Sites',    compareResult.summaryA.totalSites,   compareResult.summaryB.totalSites,   ''],
                  ] as [string, number, number, string][]).map(([label, a, b, unit]) => {
                    const d = b - a;
                    return (
                      <tr key={label}>
                        <td className="plans__compare-summary-label">{label}</td>
                        <td className="plans__compare-summary-val">{a.toLocaleString()}{unit}</td>
                        <td className="plans__compare-summary-val">{b.toLocaleString()}{unit}</td>
                        <td className={`plans__compare-summary-delta${d > 0 ? ' plans__compare-summary-delta--up' : d < 0 ? ' plans__compare-summary-delta--down' : ''}`}>
                          {d === 0 ? '=' : d > 0 ? `+${d.toLocaleString()}` : d.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                  {(() => {
                    const { siteBreakdown: bkA } = compareResult.summaryA;
                    const { siteBreakdown: bkB } = compareResult.summaryB;
                    const allSites = [...new Set([...bkA.keys(), ...bkB.keys()])].sort();
                    const changed = allSites.filter((s) => (bkA.get(s) ?? 0) !== (bkB.get(s) ?? 0));
                    if (changed.length === 0) return null;
                    return (
                      <tr key="site-breakdown">
                        <td className="plans__compare-summary-label plans__compare-summary-label--sub">by type</td>
                        <td colSpan={3} className="plans__compare-site-breakdown">
                          {changed.map((site) => {
                            const d = (bkB.get(site) ?? 0) - (bkA.get(site) ?? 0);
                            return (
                              <span
                                key={site}
                                className={`plans__compare-site-delta${d > 0 ? ' plans__compare-site-delta--up' : ' plans__compare-site-delta--down'}`}
                                title={`${site}: ${(bkA.get(site) ?? 0).toLocaleString()} → ${(bkB.get(site) ?? 0).toLocaleString()}`}
                              >
                                {d > 0 ? `+${d}` : d}× {site}
                              </span>
                            );
                          })}
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
              <table className="plans__compare-table">
                <thead>
                  <tr>
                    <th>System</th>
                    <th>Constellation</th>
                    <th>Added</th>
                    <th>Removed</th>
                  </tr>
                </thead>
                <tbody>
                  {compareResult.rows.map((r) => (
                    <tr
                      key={r.systemId}
                      className={`plans__compare-row plans__compare-row--${r.kind}`}
                    >
                      <td>{r.systemName}</td>
                      <td className="plans__compare-constellation">{r.constellationName}</td>
                      <td className="plans__compare-added">
                        {r.added.length
                          ? r.added.join(', ')
                          : <em className="plans__compare-absent">—</em>}
                      </td>
                      <td className="plans__compare-removed">
                        {r.removed.length
                          ? r.removed.join(', ')
                          : <em className="plans__compare-absent">—</em>}
                      </td>
                    </tr>
                  ))}
                  {compareResult.rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="plans__compare-empty">
                        Plans are identical.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {compareResult.transferDiffs.length > 0 && (
                <table className="plans__compare-table plans__compare-table--transfers">
                  <thead>
                    <tr>
                      <th colSpan={4} className="plans__compare-section-head">Workforce Transfers</th>
                    </tr>
                    <tr>
                      <th>From</th>
                      <th>To</th>
                      <th>{compareResult.planAName}</th>
                      <th>{compareResult.planBName}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareResult.transferDiffs.map((t) => (
                      <tr key={t.key} className="plans__compare-row plans__compare-row--changed">
                        <td>{t.sourceName}</td>
                        <td>{t.destName}</td>
                        <td className={t.amountA === null ? 'plans__compare-absent-cell' : ''}>
                          {t.amountA === null
                            ? <em className="plans__compare-absent">—</em>
                            : t.exportAllUnusedA ? 'all unused' : t.amountA.toLocaleString()}
                        </td>
                        <td className={t.amountB === null ? 'plans__compare-absent-cell' : ''}>
                          {t.amountB === null
                            ? <em className="plans__compare-absent">—</em>
                            : t.exportAllUnusedB ? 'all unused' : t.amountB.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {(() => {
            const p = plans.find((x) => x.id === contextMenu.planId);
            return (
              <>
                <button
                  type="button"
                  className="context-menu__item"
                  disabled={p?.readOnly}
                  onClick={() => {
                    if (p) { setRenameValue(p.name); setRenamingId(p.id); }
                    setContextMenu(null);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={() => {
                    if (p) void evesov.plans.setReadOnly(p.id, !p.readOnly).then(refresh);
                    setContextMenu(null);
                  }}
                >
                  {p?.readOnly ? 'Mark read/write' : 'Mark read-only'}
                </button>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={() => {
                    setComparingFromId(contextMenu.planId);
                    setCompareResult(null);
                    setContextMenu(null);
                  }}
                >
                  Compare to…
                </button>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function uniqueCopyName(base: string, existing: string[]): string {
  const taken = new Set(existing);
  // strip a trailing " (copy [N])" if it's already a copy, so duplicating "Foo (copy)" suggests "Foo (copy 2)" not "Foo (copy) (copy)"
  const stripped = base.replace(/ \(copy(?: \d+)?\)$/, '');
  let candidate = `${stripped} (copy)`;
  if (!taken.has(candidate)) return candidate;
  let i = 2;
  while (taken.has((candidate = `${stripped} (copy ${i})`))) i++;
  return candidate;
}

const DIFF_ORDER: Record<DiffRow['kind'], number> = { 'only-a': 0, 'only-b': 1, 'changed': 2 };

function siteSummaryForRollup(rollup: PlanRollup): { total: number; breakdown: Map<string, number> } {
  let total = 0;
  const breakdown = new Map<string, number>();
  for (const row of rollup.systemBalances) {
    for (const upgradeName of row.upgrades) {
      for (const g of siteEffectsFor(upgradeName, row.securityStatus)) {
        total += g.count;
        breakdown.set(g.site, (breakdown.get(g.site) ?? 0) + g.count);
      }
    }
  }
  return { total, breakdown };
}

function transferKey(t: WorkforceTransfer): string {
  return `${t.sourceSystemId}:${t.destSystemId}`;
}

function transferAmount(t: WorkforceTransfer): number {
  return t.exportAllUnused ? -1 : t.transferAmount;
}

function buildDiff(
  rollupA: PlanRollup,
  rollupB: PlanRollup,
  transfersA: WorkforceTransfer[],
  transfersB: WorkforceTransfer[],
  planAName: string,
  planBName: string,
): CompareResult {
  const mapA = new Map<number, PlanRollupRow>();
  const mapB = new Map<number, PlanRollupRow>();
  for (const r of rollupA.systemBalances) mapA.set(r.systemId, r);
  for (const r of rollupB.systemBalances) mapB.set(r.systemId, r);

  const sitesA = siteSummaryForRollup(rollupA);
  const sitesB = siteSummaryForRollup(rollupB);
  const summaryA: CompareSummary = {
    consumedIce: rollupA.totals.consumedIce,
    consumedGas: rollupA.totals.consumedGas,
    totalSites: sitesA.total,
    siteBreakdown: sitesA.breakdown,
  };
  const summaryB: CompareSummary = {
    consumedIce: rollupB.totals.consumedIce,
    consumedGas: rollupB.totals.consumedGas,
    totalSites: sitesB.total,
    siteBreakdown: sitesB.breakdown,
  };

  const allIds = new Set([...mapA.keys(), ...mapB.keys()]);
  const rows: DiffRow[] = [];

  for (const id of allIds) {
    const a = mapA.get(id);
    const b = mapB.get(id);
    const setA = new Set(a?.upgrades ?? []);
    const setB = new Set(b?.upgrades ?? []);

    // upgrades present in B but not A = added; present in A but not B = removed
    const added = [...setB].filter((u) => !setA.has(u)).sort();
    const removed = [...setA].filter((u) => !setB.has(u)).sort();

    // skip systems where nothing changed
    if (added.length === 0 && removed.length === 0) continue;

    const ref = (a ?? b)!;
    const kind: DiffRow['kind'] = !a ? 'only-b' : !b ? 'only-a' : 'changed';
    rows.push({
      systemId: id,
      systemName: ref.systemName,
      constellationName: ref.constellationName,
      regionName: ref.regionName,
      added,
      removed,
      kind,
    });
  }

  rows.sort((a, b) =>
    DIFF_ORDER[a.kind] - DIFF_ORDER[b.kind] ||
    a.systemName.localeCompare(b.systemName),
  );

  // diff workforce transfers
  const tMapA = new Map<string, WorkforceTransfer>(transfersA.map((t) => [transferKey(t), t]));
  const tMapB = new Map<string, WorkforceTransfer>(transfersB.map((t) => [transferKey(t), t]));
  const allKeys = new Set([...tMapA.keys(), ...tMapB.keys()]);
  const transferDiffs: TransferDiffRow[] = [];
  for (const key of allKeys) {
    const tA = tMapA.get(key);
    const tB = tMapB.get(key);
    if (tA && tB && transferAmount(tA) === transferAmount(tB)) continue;
    const ref = (tA ?? tB)!;
    transferDiffs.push({
      key,
      sourceName: ref.sourceName,
      destName: ref.destName,
      amountA: tA ? tA.transferAmount : null,
      amountB: tB ? tB.transferAmount : null,
      exportAllUnusedA: tA?.exportAllUnused ?? false,
      exportAllUnusedB: tB?.exportAllUnused ?? false,
    });
  }
  transferDiffs.sort((a, b) => a.sourceName.localeCompare(b.sourceName) || a.destName.localeCompare(b.destName));

  return { planAName, planBName, summaryA, summaryB, rows, transferDiffs };
}
