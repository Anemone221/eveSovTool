import { useCallback, useEffect, useRef, useState } from 'react';
import { evesov } from '@/api/evesov';
import { useUi } from '@/state/uiStore';
import type { AuditFinding, AuditFindingKind, PlanAuditResult } from '@shared/index';

const KIND_LABEL: Record<AuditFindingKind, string> = {
  'no-ishtar-sites-low-mining': 'No Ishtar-capable sites + low mining',
  'over-power': 'Over power limit',
  'over-workforce': 'Over workforce limit',
  'fits-ore-prospecting': 'Spare capacity: Ore Prospecting Array',
  'fits-major-threat': 'Spare capacity: Major Threat Detection Array',
};

const KIND_SEVERITY: Record<AuditFindingKind, 'warn' | 'error' | 'info'> = {
  'no-ishtar-sites-low-mining': 'warn',
  'over-power': 'error',
  'over-workforce': 'error',
  'fits-ore-prospecting': 'info',
  'fits-major-threat': 'info',
};

const SEVERITY_ORDER: Record<'error' | 'warn' | 'info', number> = {
  error: 0,
  warn: 1,
  info: 2,
};

const KIND_ORDER: AuditFindingKind[] = [
  'over-power',
  'over-workforce',
  'no-ishtar-sites-low-mining',
  'fits-major-threat',
  'fits-ore-prospecting',
];

function sortFindings(findings: AuditFinding[]): AuditFinding[] {
  return [...findings].sort((a, b) => {
    const sa = SEVERITY_ORDER[KIND_SEVERITY[a.kind]];
    const sb = SEVERITY_ORDER[KIND_SEVERITY[b.kind]];
    if (sa !== sb) return sa - sb;
    const ka = KIND_ORDER.indexOf(a.kind);
    const kb = KIND_ORDER.indexOf(b.kind);
    if (ka !== kb) return ka - kb;
    const ca = a.constellationName.localeCompare(b.constellationName);
    if (ca !== 0) return ca;
    return a.systemName.localeCompare(b.systemName);
  });
}

export function AuditPanel() {
  const activePlanId = useUi((s) => s.activePlanId);
  const selectSystem = useUi((s) => s.selectSystem);
  const [result, setResult] = useState<PlanAuditResult | null>(null);
  const [filter, setFilter] = useState<AuditFindingKind | 'all'>('all');
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (activePlanId === null) {
      setResult(null);
      return;
    }
    const r = await evesov.plans.audit(activePlanId);
    setResult(r);
  }, [activePlanId]);

  useEffect(() => {
    void refresh();
    const off = evesov.events.on('plan-changed', () => void refresh());
    return off;
  }, [refresh]);

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  const sorted = result ? sortFindings(result.findings) : [];
  const visible = filter === 'all' ? sorted : sorted.filter((f) => f.kind === filter);

  const copyVisible = useCallback(() => {
    const names = [...new Set(visible.map((f) => f.systemName))].join('\n');
    void navigator.clipboard.writeText(names).then(() => {
      setCopied(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
    });
  }, [visible]);

  if (activePlanId === null) {
    return <div className="audit audit--empty">Activate a plan to run the audit.</div>;
  }
  if (!result) {
    return <div className="audit audit--empty">Loading…</div>;
  }

  const counts: Partial<Record<AuditFindingKind, number>> = {};
  for (const f of sorted) counts[f.kind] = (counts[f.kind] ?? 0) + 1;

  const errorCount = sorted.filter((f) => KIND_SEVERITY[f.kind] === 'error').length;
  const warnCount = sorted.filter((f) => KIND_SEVERITY[f.kind] === 'warn').length;
  const infoCount = sorted.filter((f) => KIND_SEVERITY[f.kind] === 'info').length;

  return (
    <div className="audit">
      <header className="audit__header">
        <h2>Plan audit</h2>
        <span className="audit__summary">
          {errorCount > 0 && <span className="audit__badge audit__badge--error">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>}
          {warnCount > 0 && <span className="audit__badge audit__badge--warn">{warnCount} warning{warnCount !== 1 ? 's' : ''}</span>}
          {infoCount > 0 && <span className="audit__badge audit__badge--info">{infoCount} tip{infoCount !== 1 ? 's' : ''}</span>}
          {sorted.length === 0 && <span className="audit__badge audit__badge--ok">No issues found</span>}
        </span>
        {visible.length > 0 && (
          <button type="button" className="audit__copy-btn" onClick={copyVisible}>
            {copied ? 'Copied!' : 'Copy systems'}
          </button>
        )}
      </header>

      {sorted.length > 0 && (
        <div className="audit__filter-bar">
          <button
            type="button"
            className={`audit__filter-btn${filter === 'all' ? ' audit__filter-btn--active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({sorted.length})
          </button>
          {(Object.keys(counts) as AuditFindingKind[])
            .sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b))
            .map((kind) => (
              <button
                key={kind}
                type="button"
                className={`audit__filter-btn audit__filter-btn--${KIND_SEVERITY[kind]}${filter === kind ? ' audit__filter-btn--active' : ''}`}
                onClick={() => setFilter(kind)}
              >
                {KIND_LABEL[kind]} ({counts[kind]})
              </button>
            ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="audit__empty-filter">No findings match the selected filter.</div>
      ) : (
        <ul className="audit__list">
          {visible.map((f, i) => (
            <li key={i} className={`audit__item audit__item--${KIND_SEVERITY[f.kind]}`}>
              <div className="audit__item-header">
                <span className={`audit__severity-dot audit__severity-dot--${KIND_SEVERITY[f.kind]}`} />
                <button
                  type="button"
                  className="audit__system-link"
                  onClick={() => selectSystem(f.systemId)}
                >
                  {f.systemName}
                </button>
                <span className="audit__location">
                  {f.constellationName} / {f.regionName}
                </span>
              </div>
              <div className="audit__item-kind">{KIND_LABEL[f.kind]}</div>
              <div className="audit__item-detail">{f.detail}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
