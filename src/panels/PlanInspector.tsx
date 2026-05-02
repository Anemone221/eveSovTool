import { useCallback, useEffect, useMemo, useState } from 'react';
import { evesov } from '@/api/evesov';
import { MiniMeter } from '@/components/MiniMeter';
import { effectsForUpgrades } from '@/data/systemEffects';
import { useUi } from '@/state/uiStore';
import type {
  ClearUpgradesScope,
  PlanRollup,
  PlanRollupRow,
  PlanSummary,
  SystemBalance
} from '@shared/index';

interface ContextMenuState {
  x: number;
  y: number;
  scope: ClearUpgradesScope;
  label: string;
}

const SHOW_LOCAL_TAG_KEY = 'inspector.showLocalTag';

function isOverPowerOrWorkforce(s: SystemBalance): boolean {
  return s.consumedPower > s.availablePower || s.consumedWorkforce > s.availableWorkforce;
}

export function PlanInspector() {
  const activePlanId = useUi((s) => s.activePlanId);
  const selectSystem = useUi((s) => s.selectSystem);
  const focusPanel = useUi((s) => s.focusPanel);
  const [plan, setPlan] = useState<PlanSummary | null>(null);
  const [rollup, setRollup] = useState<PlanRollup | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [showLocalTag, setShowLocalTag] = useState(false);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [removingSystemId, setRemovingSystemId] = useState<number | null>(null);

  useEffect(() => {
    if (!menu) return;
    const dismiss = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('mousedown', dismiss);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', dismiss);
    return () => {
      window.removeEventListener('mousedown', dismiss);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', dismiss);
    };
  }, [menu]);

  const openMenu = useCallback(
    (e: React.MouseEvent, scope: ClearUpgradesScope, label: string) => {
      e.preventDefault();
      e.stopPropagation();
      setMenu({ x: e.clientX, y: e.clientY, scope, label });
    },
    []
  );

  const runClear = useCallback(
    async (scope: ClearUpgradesScope, label: string) => {
      if (activePlanId === null) return;
      if (!confirm(`Clear all upgrades for ${label}? This cannot be undone.`)) return;
      await evesov.plans.clearUpgrades(activePlanId, scope);
      setMenu(null);
    },
    [activePlanId]
  );

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

  useEffect(() => {
    void evesov.prefs.get(SHOW_LOCAL_TAG_KEY).then((v) => setShowLocalTag(v === '1'));
  }, []);

  const toggleShowLocalTag = useCallback(() => {
    setShowLocalTag((prev) => {
      const next = !prev;
      void evesov.prefs.set(SHOW_LOCAL_TAG_KEY, next ? '1' : '');
      return next;
    });
  }, []);

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
        const aOver = isOverPowerOrWorkforce(a);
        const bOver = isOverPowerOrWorkforce(b);
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
      <header
        className="inspector__header"
        onContextMenu={(e) => openMenu(e, { kind: 'plan' }, `plan "${plan.name}"`)}
      >
        <h2>{plan.name}</h2>
        <span className="inspector__meta">
          {rollup.systemBalances.length} systems ·{' '}
          {rollup.systemBalances.filter(isOverPowerOrWorkforce).length} over budget
        </span>
        <label className="inspector__pref" title="Show LOCAL badge for systems with status = local">
          <input type="checkbox" checked={showLocalTag} onChange={toggleShowLocalTag} />
          <span>Show LOCAL</span>
        </label>
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
              const overCount = g.systems.filter(isOverPowerOrWorkforce).length;
              const cTotals = aggregateTotals(g.systems);
              return (
                <div key={g.constellationId} className="inspector-tree__group">
                  <button
                    type="button"
                    className="inspector-tree__header"
                    onClick={() => toggleConstellation(g.constellationId)}
                    onContextMenu={(e) =>
                      openMenu(
                        e,
                        { kind: 'constellation', id: g.constellationId },
                        `constellation ${g.constellationName}`
                      )
                    }
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
                          <th className="num" title="Installed / Total upgrades">Inst.</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.systems.map((s) => {
                          const over = isOverPowerOrWorkforce(s);
                          const space = hasRemainingSpace(s);
                          return (
                            <tr
                              key={s.systemId}
                              className={`inspector__row${over ? ' inspector__row--over' : ''}`}
                              onContextMenu={(e) =>
                                openMenu(e, { kind: 'system', id: s.systemId }, s.systemName)
                              }
                            >
                              <td>
                                <span className={`inspector__dot${over ? ' inspector__dot--over' : ''}`} />
                              </td>
                              <td>
                                <button
                                  className="inspector__system"
                                  type="button"
                                  onClick={() => {
                                    selectSystem(s.systemId);
                                    focusPanel('system');
                                  }}
                                >
                                  {s.systemName}
                                </button>
                                {effectsForUpgrades(s.upgrades).map((eff) => (
                                  <span
                                    key={eff.label}
                                    className="effect-badge"
                                    title={`${eff.label}: ${eff.description}`}
                                  >
                                    {eff.symbol}
                                  </span>
                                ))}
                                {s.status !== 'local' && (
                                  <span className={`status-tag status-tag--${s.status}`} title={`Workforce: ${s.status}`}>
                                    {s.status}
                                  </span>
                                )}
                                {s.status === 'local' && showLocalTag && (
                                  <span className="status-tag status-tag--local" title="Workforce: local">
                                    local
                                  </span>
                                )}
                              </td>
                              <td>
                                {space && (
                                  <span className="inspector__space" title="Has remaining power and workforce for more upgrades">+</span>
                                )}
                              </td>
                              <BalanceCells b={s} />
                              <td className={`num inspector__installed${s.totalCount > 0 && s.installedCount === s.totalCount ? ' inspector__installed--complete' : ''}`}>
                                {s.totalCount > 0 ? `${s.installedCount}/${s.totalCount}` : '—'}
                              </td>
                              <td>
                                {removingSystemId === s.systemId ? (
                                  <span className="inspector__remove-confirm">
                                    <button
                                      type="button"
                                      className="btn-icon btn-icon--danger inspector__remove-yes"
                                      onClick={() => {
                                        void evesov.plans
                                          .removeSystem(activePlanId, s.systemId)
                                          .then(() => setRemovingSystemId(null));
                                      }}
                                      title={`Confirm remove ${s.systemName}. Assigned upgrades are kept (use "Clear upgrades" to delete them).`}
                                    >
                                      Remove
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-icon"
                                      onClick={() => setRemovingSystemId(null)}
                                      title="Cancel"
                                    >
                                      Cancel
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn-icon btn-icon--danger"
                                    onClick={() => setRemovingSystemId(s.systemId)}
                                    title={`Remove ${s.systemName}`}
                                    aria-label={`Remove ${s.systemName}`}
                                  >
                                    ×
                                  </button>
                                )}
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
      {menu && (
        <div
          className="context-menu"
          style={{ top: menu.y, left: menu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="context-menu__item"
            onClick={() => void runClear(menu.scope, menu.label)}
          >
            Clear upgrades for {menu.label}
          </button>
        </div>
      )}
    </div>
  );
}

function hasRemainingSpace(s: SystemBalance): boolean {
  return s.consumedPower < s.availablePower && s.consumedWorkforce < s.availableWorkforce;
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
