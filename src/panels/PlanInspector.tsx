import html2canvas from 'html2canvas';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evesov } from '@/api/evesov';
import { MiniMeter } from '@/components/MiniMeter';
import { OpsecPill } from '@/components/OpsecPill';
import { buildExportFilename } from '@/data/exportFilename';
import { withOpsecCapture } from '@/data/opsecCapture';
import { badgesForUpgrades } from '@/data/systemEffects';
import { classifyCapacity } from '@/data/upgradeFamilies';
import { useExportRegistry } from '@/state/exportRegistry';
import { useOpsec } from '@/state/opsecStore';
import { useUi } from '@/state/uiStore';
import type {
  ClearUpgradesScope,
  PlanRollup,
  PlanRollupRow,
  PlanSummary,
  SystemBalance,
  Upgrade
} from '@shared/index';

interface MenuAction {
  label: string;
  danger?: boolean;
  run: () => Promise<void> | void;
}

interface ContextMenuState {
  x: number;
  y: number;
  actions: MenuAction[];
}

const SHOW_LOCAL_TAG_KEY = 'inspector.showLocalTag';

function isOverPowerOrWorkforce(s: SystemBalance): boolean {
  return s.consumedPower > s.availablePower || s.consumedWorkforce > s.availableWorkforce;
}

export function PlanInspector() {
  const activePlanId = useUi((s) => s.activePlanId);
  const planReadOnly = useUi((s) => s.activePlanReadOnly);
  const selectSystem = useUi((s) => s.selectSystem);
  const focusPanel = useUi((s) => s.focusPanel);
  const [plan, setPlan] = useState<PlanSummary | null>(null);
  const [rollup, setRollup] = useState<PlanRollup | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [showLocalTag, setShowLocalTag] = useState(false);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [removingSystemId, setRemovingSystemId] = useState<number | null>(null);
  const [upgrades, setUpgrades] = useState<Upgrade[]>([]);
  const [capitalSystemId, setCapitalSystemId] = useState<number | null>(null);
  const inspectorRef = useRef<HTMLDivElement>(null);

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
    (e: React.MouseEvent, actions: MenuAction[]) => {
      e.preventDefault();
      e.stopPropagation();
      setMenu({ x: e.clientX, y: e.clientY, actions });
    },
    []
  );

  const clearAction = useCallback(
    (scope: ClearUpgradesScope, label: string): MenuAction => ({
      label: `Clear upgrades for ${label}`,
      danger: true,
      run: async () => {
        if (activePlanId === null) return;
        if (!confirm(`Clear all upgrades for ${label}? This cannot be undone.`)) return;
        await evesov.plans.clearUpgrades(activePlanId, scope);
      }
    }),
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
    setCapitalSystemId(got?.capitalSystemIds?.[0] ?? null);
    const summary = await evesov.plans.summary(activePlanId);
    setRollup(summary);
  }, [activePlanId]);

  const setCapitalAction = useCallback(
    (systemId: number, systemName: string, isCurrentCapital: boolean): MenuAction => ({
      label: isCurrentCapital ? `Clear capital system (${systemName})` : `Set ${systemName} as capital system`,
      run: async () => {
        if (activePlanId === null) return;
        await evesov.plans.setCapital(activePlanId, systemId, !isCurrentCapital);
      }
    }),
    [activePlanId]
  );

  const refreshUpgrades = useCallback(async () => {
    setUpgrades(await evesov.data.upgrades());
  }, []);

  useEffect(() => {
    void refresh();
    const off = evesov.events.on('plan-changed', () => {
      void refresh();
    });
    return off;
  }, [refresh]);

  useEffect(() => {
    void refreshUpgrades();
    const off = evesov.events.on('data-refreshed', () => {
      void refreshUpgrades();
    });
    return off;
  }, [refreshUpgrades]);

  const onExportPng = useCallback(async () => {
    const el = inspectorRef.current;
    if (!el || activePlanId === null) return;
    const got = await evesov.plans.get(activePlanId);
    if (!got) return;
    const dataUrl = await withOpsecCapture(async () => {
      const canvas = await html2canvas(el, {
        backgroundColor: '#1a1a1a',
        width: el.scrollWidth,
        height: el.scrollHeight,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
        scrollX: 0,
        scrollY: 0
      });
      return canvas.toDataURL('image/png');
    });
    const filename = buildExportFilename({ planName: got.plan.name, panel: 'inspector' });
    await evesov.exports.capturePng(filename, dataUrl, {
      planId: activePlanId,
      planName: got.plan.name,
      panel: 'inspector',
      opsecPreset: useOpsec.getState().preset
    });
  }, [activePlanId]);

  useEffect(() => {
    useExportRegistry.getState().register('inspector', onExportPng);
    return () => useExportRegistry.getState().unregister('inspector');
  }, [onExportPng]);

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
        onContextMenu={(e) => {
          if (planReadOnly) return;
          openMenu(e, [clearAction({ kind: 'plan' }, `plan "${plan.name}"`)]);
        }}
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
        <OpsecPill />
        <button type="button" className="inspector__export-btn" onClick={() => void onExportPng()}>
          Export PNG
        </button>
      </header>
      <div className="inspector__capture" ref={inspectorRef}>
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
                    onContextMenu={(e) => {
                      if (planReadOnly) return;
                      openMenu(e, [
                        clearAction(
                          { kind: 'constellation', id: g.constellationId },
                          `constellation ${g.constellationName}`
                        )
                      ]);
                    }}
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
                      <colgroup>
                        <col className="col-dot" />
                        <col className="col-system" />
                        <col className="col-plus" />
                        <col className="col-power" />
                        <col className="col-workforce" />
                        <col className="col-ice" />
                        <col className="col-gas" />
                        <col className="col-fuel" />
                        <col className="col-inst" />
                        <col className="col-remove" />
                      </colgroup>
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
                          const flavor = classifyCapacity(
                            s.availablePower - s.consumedPower,
                            s.availableWorkforce - s.consumedWorkforce,
                            upgrades,
                            s.upgrades
                          );
                          const cynoConflict =
                            s.upgrades.includes('Cynosural Navigation') &&
                            s.upgrades.includes('Cynosural Suppression');
                          return (
                            <tr
                              key={s.systemId}
                              className={`inspector__row${over ? ' inspector__row--over' : ''}`}
                              onContextMenu={(e) => {
                                if (planReadOnly) return;
                                openMenu(e, [
                                  setCapitalAction(
                                    s.systemId,
                                    s.systemName,
                                    capitalSystemId === s.systemId
                                  ),
                                  clearAction({ kind: 'system', id: s.systemId }, s.systemName)
                                ]);
                              }}
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
                                {capitalSystemId === s.systemId && (
                                  <span
                                    className="inspector__capital-flag"
                                    title="Plan capital system"
                                    aria-label="Plan capital system"
                                  >
                                    ⚑
                                  </span>
                                )}
                                {cynoConflict && (
                                  <span
                                    className="inspector__warn-flag"
                                    title="Conflict: this system has both a Cyno Beacon (Cynosural Navigation) and a Cyno Jammer (Cynosural Suppression)."
                                    aria-label="Cyno beacon/jammer conflict"
                                  >
                                    ⚠
                                  </span>
                                )}
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
                                {badgesForUpgrades(s.upgrades).map((b) => (
                                  <img
                                    key={b.key}
                                    src={b.icon}
                                    alt={b.label}
                                    title={b.description}
                                    className="effect-badge__icon"
                                  />
                                ))}
                                {s.alnLink && (
                                  <span
                                    className="inspector__aln"
                                    title={`Ansiblex link → ${s.alnLink.linkedSystemName}`}
                                  >
                                    →{' '}
                                    <span className="inspector__aln-pill">
                                      {s.alnLink.linkedSystemName}
                                    </span>
                                  </span>
                                )}
                              </td>
                              <td>
                                {flavor && (
                                  <span
                                    className={`inspector__space inspector__space--${flavor}`}
                                    title={
                                      flavor === 'yellow'
                                        ? 'Only Power Monitoring, Workforce Mecha-Tooling, or Stability Generator upgrades still fit here'
                                        : 'Has remaining space for additional upgrades'
                                    }
                                  >
                                    +
                                  </span>
                                )}
                              </td>
                              <BalanceCells b={s} />
                              <td className={`num inspector__installed${s.totalCount > 0 && s.installedCount === s.totalCount ? ' inspector__installed--complete' : ''}`}>
                                {s.totalCount > 0 ? `${s.installedCount}/${s.totalCount}` : '—'}
                              </td>
                              <td>
                                {!planReadOnly && (removingSystemId === s.systemId ? (
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
                                ))}
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
      {menu && (
        <div
          className="context-menu"
          style={{ top: menu.y, left: menu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menu.actions.map((action, i) => (
            <button
              key={i}
              type="button"
              className={`context-menu__item${action.danger ? ' context-menu__item--danger' : ''}`}
              onClick={() => {
                void Promise.resolve(action.run()).then(() => setMenu(null));
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
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
