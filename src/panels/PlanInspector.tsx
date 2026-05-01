import { useCallback, useEffect, useMemo, useState } from 'react';
import { evesov } from '@/api/evesov';
import { useUi } from '@/state/uiStore';
import type { PlanRollup, PlanRollupRow, PlanSummary, SystemBalance } from '@shared/index';

export function PlanInspector() {
  const activePlanId = useUi((s) => s.activePlanId);
  const selectSystem = useUi((s) => s.selectSystem);
  const [plan, setPlan] = useState<PlanSummary | null>(null);
  const [rollup, setRollup] = useState<PlanRollup | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    if (activePlanId === null) {
      setPlan(null);
      setRollup(null);
      return;
    }
    const got = await evesov.plans.get(activePlanId);
    setPlan(got?.plan ?? null);
    const summary = await evesov.plans.summary(activePlanId);
    setRollup(summary);
  }, [activePlanId]);

  useEffect(() => {
    void refresh();
    const off = evesov.events.on('plan-changed', () => {
      void refresh();
    });
    return off;
  }, [refresh]);

  const grouped = useMemo(() => {
    if (!rollup) return [] as Array<{
      constellationId: number;
      constellationName: string;
      regionName: string;
      systems: PlanRollupRow[];
    }>;
    const m = new Map<number, { constellationId: number; constellationName: string; regionName: string; systems: PlanRollupRow[] }>();
    for (const s of rollup.systemBalances) {
      let g = m.get(s.constellationId);
      if (!g) {
        g = {
          constellationId: s.constellationId,
          constellationName: s.constellationName,
          regionName: s.regionName,
          systems: []
        };
        m.set(s.constellationId, g);
      }
      g.systems.push(s);
    }
    const arr = Array.from(m.values());
    arr.sort((a, b) =>
      a.regionName.localeCompare(b.regionName) || a.constellationName.localeCompare(b.constellationName)
    );
    for (const g of arr) {
      g.systems.sort((a, b) => {
        const aOver = a.consumedPower > a.availablePower || a.consumedWorkforce > a.availableWorkforce;
        const bOver = b.consumedPower > b.availablePower || b.consumedWorkforce > b.availableWorkforce;
        if (aOver !== bOver) return aOver ? -1 : 1;
        return a.systemName.localeCompare(b.systemName);
      });
    }
    return arr;
  }, [rollup]);

  const toggleConstellation = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (activePlanId === null) {
    return <div className="inspector inspector--empty">Select or create a plan to see its rollup.</div>;
  }
  if (!plan || !rollup) {
    return <div className="inspector inspector--empty">Loading…</div>;
  }

  return (
    <div className="inspector">
      <header className="inspector__header">
        <h2>{plan.name}</h2>
        <span className="inspector__meta">
          {rollup.systemBalances.length} systems · {rollup.unbalancedSystems.length} over budget
        </span>
      </header>
      <section className="inspector__section">
        <h3>Plan totals</h3>
        <table className="kv">
          <tbody>
            <BudgetRow label="Power"             available={rollup.totals.availablePower}     consumed={rollup.totals.consumedPower} />
            <BudgetRow label="Workforce"         available={rollup.totals.availableWorkforce} consumed={rollup.totals.consumedWorkforce} />
            <BudgetRow label="Superionic Ice / h" available={rollup.totals.availableIce}      consumed={rollup.totals.consumedIce} />
            <BudgetRow label="Magmatic Gas / h"   available={rollup.totals.availableGas}      consumed={rollup.totals.consumedGas} />
            <tr><th>Startup fuel</th><td>{rollup.totals.startupFuel.toLocaleString()}</td></tr>
          </tbody>
        </table>
      </section>
      <section className="inspector__section">
        <h3>Systems in plan</h3>
        {grouped.length === 0 ? (
          <p className="detail__muted">No systems scoped or upgraded yet. Set scopes from the Universe tree (the +/✓ buttons) or assign upgrades from System detail.</p>
        ) : (
          <div className="inspector-tree">
            {grouped.map((g) => {
              const isCollapsed = collapsed.has(g.constellationId);
              const overCount = g.systems.filter((s) => s.consumedPower > s.availablePower || s.consumedWorkforce > s.availableWorkforce).length;
              const cTotals = aggregateTotals(g.systems);
              return (
                <div key={g.constellationId} className="inspector-tree__group">
                  <button
                    type="button"
                    className="inspector-tree__header"
                    onClick={() => toggleConstellation(g.constellationId)}
                  >
                    <span className="tree__chevron">{isCollapsed ? '▸' : '▾'}</span>
                    <span className="inspector-tree__title">
                      {g.constellationName}
                      <span className="inspector-tree__region"> ({g.regionName})</span>
                    </span>
                    <span className="inspector-tree__counts">
                      {g.systems.length} systems
                      {overCount > 0 && (
                        <span className="inspector-tree__over"> · {overCount} over</span>
                      )}
                    </span>
                    <span className="inspector-tree__totals" title="Constellation totals (consumed / available)">
                      <MiniMeter label="P" consumed={cTotals.consumedPower} available={cTotals.availablePower} />
                      <MiniMeter label="W" consumed={cTotals.consumedWorkforce} available={cTotals.availableWorkforce} />
                      <MiniMeter label="I" consumed={cTotals.consumedIce} available={cTotals.availableIce} />
                      <MiniMeter label="G" consumed={cTotals.consumedGas} available={cTotals.availableGas} />
                    </span>
                  </button>
                  {!isCollapsed && (
                    <table className="grid inspector-tree__systems">
                      <thead>
                        <tr>
                          <th></th>
                          <th>System</th>
                          <th></th>
                          <th className="num">Power</th>
                          <th className="num">Workforce</th>
                          <th className="num">Ice</th>
                          <th className="num">Gas</th>
                          <th className="num">Fuel</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.systems.map((s) => {
                          const space = hasRemainingSpace(s);
                          const overBudget = s.consumedPower > s.availablePower || s.consumedWorkforce > s.availableWorkforce;
                          return (
                            <tr key={s.systemId} className={`inspector__row${overBudget ? ' inspector__row--over' : ''}`}>
                              <td>
                                <span className={`inspector__dot${overBudget ? ' inspector__dot--over' : ''}`} />
                              </td>
                              <td>
                                <button className="inspector__system" type="button" onClick={() => selectSystem(s.systemId)}>
                                  {s.systemName}
                                </button>
                                {s.status !== 'local' && (
                                  <span className={`status-tag status-tag--${s.status}`} title={`Workforce: ${s.status}`}>
                                    {s.status}
                                  </span>
                                )}
                              </td>
                              <td>
                                {s.balanced && space && (
                                  <span className="inspector__space" title="Has remaining capacity for more upgrades">+</span>
                                )}
                              </td>
                              <BalanceCells b={s} />
                              <td>
                                <button
                                  type="button"
                                  className="btn-icon btn-icon--danger"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Remove ${s.systemName} from plan? This clears its upgrades and any direct system scope (parent region/constellation scopes are unaffected).`
                                      )
                                    ) {
                                      void evesov.plans.removeSystem(activePlanId, s.systemId);
                                    }
                                  }}
                                  title={`Remove ${s.systemName}`}
                                  aria-label={`Remove ${s.systemName}`}
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function hasRemainingSpace(s: SystemBalance): boolean {
  return (
    s.consumedPower < s.availablePower ||
    s.consumedWorkforce < s.availableWorkforce ||
    s.consumedIce < s.availableIce ||
    s.consumedGas < s.availableGas
  );
}

interface ConstellationTotals {
  availablePower: number;
  consumedPower: number;
  availableWorkforce: number;
  consumedWorkforce: number;
  availableIce: number;
  consumedIce: number;
  availableGas: number;
  consumedGas: number;
}

function aggregateTotals(systems: SystemBalance[]): ConstellationTotals {
  return systems.reduce<ConstellationTotals>(
    (acc, s) => {
      acc.availablePower += s.availablePower;
      acc.consumedPower += s.consumedPower;
      acc.availableWorkforce += s.availableWorkforce;
      acc.consumedWorkforce += s.consumedWorkforce;
      acc.availableIce += s.availableIce;
      acc.consumedIce += s.consumedIce;
      acc.availableGas += s.availableGas;
      acc.consumedGas += s.consumedGas;
      return acc;
    },
    {
      availablePower: 0,
      consumedPower: 0,
      availableWorkforce: 0,
      consumedWorkforce: 0,
      availableIce: 0,
      consumedIce: 0,
      availableGas: 0,
      consumedGas: 0
    }
  );
}

function MiniMeter({ label, consumed, available }: { label: string; consumed: number; available: number }) {
  const usage = available > 0 ? Math.min(consumed / available, 1) : consumed > 0 ? 1 : 0;
  const over = consumed > available;
  const hue = over ? 0 : 120 * (1 - usage);
  const color = over ? 'var(--danger)' : `hsl(${hue.toFixed(0)}, 65%, 50%)`;
  return (
    <span className="mini-meter" title={`${consumed.toLocaleString()} / ${available.toLocaleString()}`}>
      <span className="mini-meter__label">{label}</span>
      <span className="mini-meter__track">
        <span className="mini-meter__fill" style={{ width: `${usage * 100}%`, background: color }} />
      </span>
    </span>
  );
}

function BudgetRow({ label, available, consumed }: { label: string; available: number; consumed: number }) {
  const remaining = available - consumed;
  return (
    <tr>
      <th>{label}</th>
      <td>
        <span className={remaining < 0 ? 'cost-over' : ''}>{consumed.toLocaleString()}</span>
        <span className="kv__sep"> / {available.toLocaleString()}</span>
        <span className={remaining < 0 ? 'cost-over' : 'cost-ok'}> ({remaining.toLocaleString()})</span>
      </td>
    </tr>
  );
}

function BalanceCells({ b }: { b: SystemBalance }) {
  return (
    <>
      <BalanceCell consumed={b.consumedPower} available={b.availablePower} />
      <BalanceCell consumed={b.consumedWorkforce} available={b.availableWorkforce} />
      <BalanceCell consumed={b.consumedIce} available={b.availableIce} />
      <BalanceCell consumed={b.consumedGas} available={b.availableGas} />
      <td className="num">{b.startupFuel.toLocaleString()}</td>
    </>
  );
}

function BalanceCell({ consumed, available }: { consumed: number; available: number }) {
  const over = consumed > available;
  return (
    <td className={`num${over ? ' cost-over' : ''}`}>
      {consumed.toLocaleString()}/{available.toLocaleString()}
    </td>
  );
}
