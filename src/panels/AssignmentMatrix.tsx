import { useCallback, useEffect, useMemo, useState } from 'react';
import { evesov } from '@/api/evesov';
import { useUi } from '@/state/uiStore';
import type { PlanMatrix, Upgrade } from '@shared/index';

export function AssignmentMatrix() {
  const activePlanId = useUi((s) => s.activePlanId);
  const selectSystem = useUi((s) => s.selectSystem);
  const [matrix, setMatrix] = useState<PlanMatrix | null>(null);
  const [allUpgrades, setAllUpgrades] = useState<Upgrade[]>([]);

  useEffect(() => {
    void evesov.data.upgrades().then(setAllUpgrades);
  }, []);

  const refresh = useCallback(async () => {
    if (activePlanId === null) {
      setMatrix(null);
      return;
    }
    const m = await evesov.plans.matrix(activePlanId);
    setMatrix(m);
  }, [activePlanId]);

  useEffect(() => {
    void refresh();
    const off = evesov.events.on('plan-changed', () => {
      void refresh();
    });
    return off;
  }, [refresh]);

  const columns = useMemo(() => allUpgrades.map((u) => u.name), [allUpgrades]);
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    if (!matrix) return m;
    for (const s of matrix.systems) {
      for (const u of s.upgrades) m.set(u, (m.get(u) ?? 0) + 1);
    }
    return m;
  }, [matrix]);

  if (activePlanId === null) {
    return <div className="overview overview--empty">Activate a plan to see its assignment matrix.</div>;
  }
  if (!matrix) return <div className="overview overview--empty">Loading…</div>;
  if (matrix.systems.length === 0) {
    return <div className="overview overview--empty">No systems in plan yet. Add scopes from the Universe tree or assign upgrades from System detail.</div>;
  }

  return (
    <div className="overview">
      <header className="overview__header">
        <h2>Assignment matrix</h2>
        <span className="overview__meta">
          {matrix.systems.length} systems · {columns.length} upgrades
        </span>
      </header>
      <div className="matrix__scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th className="matrix__sticky-col matrix__corner">System</th>
              <th className="matrix__headers-cell" colSpan={columns.length}>
                <div className="matrix__headers-row">
                  {columns.map((c) => (
                    <div key={c} className="matrix__header-slot">
                      <span className="matrix__col-text">{c}</span>
                    </div>
                  ))}
                </div>
              </th>
            </tr>
            <tr className="matrix__totals-row">
              <th className="matrix__sticky-col matrix__totals-label">Totals</th>
              {columns.map((c) => {
                const t = totals.get(c) ?? 0;
                return (
                  <th key={c} className="matrix__totals-cell">
                    {t > 0 ? t : ''}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {matrix.systems.map((s) => {
              const set = new Set(s.upgrades);
              return (
                <tr key={s.id}>
                  <td className="matrix__sticky-col matrix__system-cell">
                    <div className="matrix__system-name-row">
                      <button className="inspector__system" onClick={() => selectSystem(s.id)} type="button">
                        {s.name}
                      </button>
                      {s.status !== 'local' && (
                        <span className={`status-tag status-tag--${s.status}`} title={`Workforce: ${s.status}`}>
                          {s.status}
                        </span>
                      )}
                    </div>
                    <div className="matrix__system-meta">
                      {s.constellationName}
                      <span className="matrix__region"> / {s.regionName}</span>
                    </div>
                  </td>
                  {columns.map((c) => (
                    <td key={c} className={`matrix__cell${set.has(c) ? ' matrix__cell--on' : ''}`}>
                      {set.has(c) ? '●' : ''}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
