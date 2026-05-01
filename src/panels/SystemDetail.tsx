import { evesov } from '@/api/evesov';
import { aggregateGrants, formatGrants, siteEffectsFor } from '@/data/effects';
import { useUi } from '@/state/uiStore';
import type {
    PlanUpgradeRow,
    SystemBalance,
    SystemDetail as SystemDetailDto,
    SystemStatus,
    Upgrade
} from '@shared/index';
import { useCallback, useEffect, useMemo, useState } from 'react';

const STATUS_OPTIONS: SystemStatus[] = ['local', 'export', 'import', 'transit'];
const STATUS_LABEL: Record<SystemStatus, string> = {
  local: 'Local',
  export: 'Export',
  import: 'Import',
  transit: 'Transit'
};

type ResourceMode = 'consumed' | 'remaining';

export function SystemDetail() {
  const systemId = useUi((s) => s.selectedSystemId);
  const activePlanId = useUi((s) => s.activePlanId);
  const [detail, setDetail] = useState<SystemDetailDto | null>(null);
  const [allUpgrades, setAllUpgrades] = useState<Upgrade[]>([]);
  const [assigned, setAssigned] = useState<PlanUpgradeRow[]>([]);
  const [balance, setBalance] = useState<SystemBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [onlyFits, setOnlyFits] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [starOpen, setStarOpen] = useState(true);
  const [planetsOpen, setPlanetsOpen] = useState(true);

  useEffect(() => {
    void evesov.prefs.get('detail.section.star').then((v) => {
      if (v !== null) setStarOpen(v !== '0');
    });
    void evesov.prefs.get('detail.section.planets').then((v) => {
      if (v !== null) setPlanetsOpen(v !== '0');
    });
  }, []);

  const toggleStar = () => {
    setStarOpen((prev) => {
      const next = !prev;
      void evesov.prefs.set('detail.section.star', next ? '1' : '0');
      return next;
    });
  };
  const togglePlanets = () => {
    setPlanetsOpen((prev) => {
      const next = !prev;
      void evesov.prefs.set('detail.section.planets', next ? '1' : '0');
      return next;
    });
  };

  useEffect(() => {
    void evesov.data.upgrades().then(setAllUpgrades);
  }, []);

  const fetchPlanState = useCallback(async (sid: number, pid: number) => {
    const [planSnap, b] = await Promise.all([
      evesov.plans.get(pid),
      evesov.plans.systemBalance(pid, sid)
    ]);
    setAssigned((planSnap?.upgrades ?? []).filter((u) => u.systemId === sid));
    setBalance(b);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (systemId === null) {
      setDetail(null);
      setAssigned([]);
      setBalance(null);
      return;
    }
    setLoading(true);
    void (async () => {
      const d = await evesov.data.system(systemId);
      if (cancelled) return;
      setDetail(d);
      if (activePlanId !== null && d) {
        await fetchPlanState(systemId, activePlanId);
      } else {
        setAssigned([]);
        setBalance(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [systemId, activePlanId, fetchPlanState]);

  useEffect(() => {
    if (systemId === null || activePlanId === null) return;
    const off = evesov.events.on('plan-changed', () => {
      void fetchPlanState(systemId, activePlanId);
    });
    return off;
  }, [systemId, activePlanId, fetchPlanState]);

  const upgradeMap = useMemo(() => {
    const m = new Map<string, Upgrade>();
    for (const u of allUpgrades) m.set(u.name, u);
    return m;
  }, [allUpgrades]);

  const wouldFit = useCallback(
    (u: Upgrade): boolean => {
      if (!balance) return true;
      return (
        balance.consumedPower + u.power <= balance.availablePower &&
        balance.consumedWorkforce + u.workforce <= balance.availableWorkforce
      );
    },
    [balance]
  );

  const visibleAvailable = useMemo(() => {
    const assignedNames = new Set(assigned.map((a) => a.upgradeName));
    let list = allUpgrades.filter((u) => !assignedNames.has(u.name));
    if (onlyFits) list = list.filter(wouldFit);
    if (filter.trim()) {
      const q = filter.toLowerCase();
      list = list.filter((u) => u.name.toLowerCase().includes(q));
    }
    return list;
  }, [allUpgrades, assigned, filter, onlyFits, wouldFit]);

  const sec = detail?.system.securityStatus ?? null;

  const aggregatedGrants = useMemo(
    () => aggregateGrants(assigned.map((a) => siteEffectsFor(a.upgradeName, sec))),
    [assigned, sec]
  );

  if (systemId === null) {
    return <div className="detail detail--empty">Select a system from the tree to view its details.</div>;
  }
  if (loading || !detail) {
    return <div className="detail detail--empty">Loading…</div>;
  }

  const { system, region, constellation, star, planets, budget } = detail;

  const assign = async (name: string) => {
    if (activePlanId === null) return;
    setWorking(name);
    try {
      const r = await evesov.plans.assignUpgrade(activePlanId, systemId, name);
      if (!r.ok) console.warn('assign failed', r.error);
    } finally {
      setWorking(null);
    }
  };
  const remove = async (name: string) => {
    if (activePlanId === null) return;
    setWorking(name);
    try {
      await evesov.plans.removeUpgrade(activePlanId, systemId, name);
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="detail">
      <header className="detail__header">
        <div className="detail__title-row">
          <h2>{system.name}</h2>
          {activePlanId !== null && budget.sovEligible && (
            <label className={`status-pill status-pill--${balance?.status ?? 'local'}`} title="Workforce status in this plan">
              <span className="status-pill__dot" />
              <select
                className="status-pill__select"
                value={balance?.status ?? 'local'}
                onChange={(e) => {
                  void evesov.plans.setSystemStatus(activePlanId, systemId, e.target.value as SystemStatus);
                }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="detail__breadcrumb">
          {region.name} <span className="detail__sep">›</span> {constellation.name}
          {system.securityStatus !== null && (
            <span className="detail__sec">sec {system.securityStatus.toFixed(2)}</span>
          )}
          {!budget.sovEligible && <span className="detail__badge">non-sov</span>}
        </div>
      </header>

      <section className="detail__section">
        <h3>
          Resource budget
          {activePlanId === null && <span className="detail__muted-inline"> (no active plan)</span>}
        </h3>
        <BudgetBar
          label="Power"
          available={budget.availablePower}
          consumed={balance?.consumedPower ?? 0}
          mode="consumed"
        />
        <BudgetBar
          label="Workforce"
          available={budget.availableWorkforce}
          consumed={balance?.consumedWorkforce ?? 0}
          mode="consumed"
        />
        <BudgetBar
          label="Superionic Ice / h"
          available={budget.availableIce}
          consumed={balance?.consumedIce ?? 0}
          mode="remaining"
        />
        <BudgetBar
          label="Magmatic Gas / h"
          available={budget.availableGas}
          consumed={balance?.consumedGas ?? 0}
          mode="remaining"
        />
        {balance && balance.startupFuel > 0 && (
          <div className="detail__muted" style={{ marginTop: 8 }}>
            One-time startup fuel: <strong>{balance.startupFuel.toLocaleString()}</strong>
          </div>
        )}
      </section>

      <div className="detail__columns">
        <div className="detail__columns-inner">
          <section className={`detail__section detail__col-star${starOpen ? '' : ' detail__section--collapsed'}`}>
            <button type="button" className="detail__section-toggle" onClick={toggleStar} aria-expanded={starOpen}>
              <span className="tree__chevron">{starOpen ? '▾' : '▸'}</span>
              <h3>Star</h3>
            </button>
            {starOpen && (
              star ? (
                <table className="kv">
                  <tbody>
                    <tr><th>Description</th><td>{star.description ?? '—'}</td></tr>
                    <tr><th>Spectral class</th><td>{star.spectralClass ?? '—'}</td></tr>
                    <tr><th>Power</th><td>{star.power.toLocaleString()}</td></tr>
                  </tbody>
                </table>
              ) : (
                <p className="detail__muted">No star record.</p>
              )
            )}
          </section>

          <section className={`detail__section detail__col-planets${planetsOpen ? '' : ' detail__section--collapsed'}`}>
            <button type="button" className="detail__section-toggle" onClick={togglePlanets} aria-expanded={planetsOpen}>
              <span className="tree__chevron">{planetsOpen ? '▾' : '▸'}</span>
              <h3>Planets ({planets.length})</h3>
            </button>
            {planetsOpen && (
              planets.length ? (
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th className="num">Power</th>
                      <th className="num">Workforce</th>
                      <th className="num">Ice/h</th>
                      <th className="num">Gas/h</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planets.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td className="num">{p.power.toLocaleString()}</td>
                        <td className="num">{p.workforce.toLocaleString()}</td>
                        <td className="num">{p.superionicIcePerHour.toLocaleString()}</td>
                        <td className="num">{p.magmaticGasPerHour.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="detail__muted">No planets in this system.</p>
              )
            )}
          </section>
        </div>
      </div>

      {aggregatedGrants.length > 0 && (
        <section className="detail__section">
          <h3>Sites granted in this system</h3>
          <ul className="grants">
            {aggregatedGrants.map((g) => (
              <li key={g.site}>
                <span className="grants__count">{g.count}×</span> {g.site}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="detail__section">
        <h3>Plan upgrades for this system</h3>
        {activePlanId === null ? (
          <p className="detail__muted">Activate a plan to assign upgrades.</p>
        ) : !budget.sovEligible ? (
          <p className="detail__muted">This system is not sov-eligible.</p>
        ) : assigned.length === 0 ? (
          <p className="detail__muted">No upgrades assigned. Pick from the list below.</p>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>Name</th>
                <th className="num">Power</th>
                <th className="num">Workforce</th>
                <th className="num">Ice</th>
                <th className="num">Gas</th>
                <th className="num">Fuel</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {assigned.flatMap((a) => {
                const u = upgradeMap.get(a.upgradeName);
                const grants = siteEffectsFor(a.upgradeName, sec);
                const rows = [
                  <tr key={a.upgradeName}>
                    <td>{a.upgradeName}</td>
                    <td className={`num${u && u.power < 0 ? ' cost-produces' : ''}`}>{u?.power.toLocaleString() ?? '—'}</td>
                    <td className={`num${u && u.workforce < 0 ? ' cost-produces' : ''}`}>{u?.workforce.toLocaleString() ?? '—'}</td>
                    <td className={`num${u && u.superionicIce < 0 ? ' cost-produces' : ''}`}>{u?.superionicIce.toLocaleString() ?? '—'}</td>
                    <td className={`num${u && u.magmaticGas < 0 ? ' cost-produces' : ''}`}>{u?.magmaticGas.toLocaleString() ?? '—'}</td>
                    <td className="num">{u?.startup.toLocaleString() ?? '—'}</td>
                    <td className="row-action">
                      <button
                        type="button"
                        className="btn-icon btn-icon--danger"
                        onClick={() => void remove(a.upgradeName)}
                        disabled={working === a.upgradeName}
                        title={`Remove ${a.upgradeName}`}
                        aria-label={`Remove ${a.upgradeName}`}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ];
                if (grants.length > 0) {
                  rows.push(
                    <tr key={`${a.upgradeName}-grants`} className="row-grants">
                      <td colSpan={7} className="row-grants__cell">→ {formatGrants(grants)}</td>
                    </tr>
                  );
                }
                return rows;
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="detail__section">
        <h3>Available upgrades</h3>
        {activePlanId === null ? (
          <p className="detail__muted">Activate a plan first.</p>
        ) : !budget.sovEligible ? (
          <p className="detail__muted">Not sov-eligible.</p>
        ) : (
          <>
            <div className="detail__filter-row">
              <input
                type="search"
                placeholder="Filter upgrades…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="detail__filter"
              />
              <label className="detail__check">
                <input
                  type="checkbox"
                  checked={onlyFits}
                  onChange={(e) => setOnlyFits(e.target.checked)}
                />
                Only available with remaining resources
              </label>
            </div>
            <table className="grid">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="num">Power</th>
                  <th className="num">Workforce</th>
                  <th className="num">Ice</th>
                  <th className="num">Gas</th>
                  <th className="num">Fuel</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleAvailable.flatMap((u) => {
                  const fits = wouldFit(u);
                  const grants = siteEffectsFor(u.name, sec);
                  const rows = [
                    <tr key={u.name} className={fits ? '' : 'row-over'}>
                      <td>{u.name}</td>
                      <td className={`num${u.power < 0 ? ' cost-produces' : ''}`}>{u.power.toLocaleString()}</td>
                      <td className={`num${u.workforce < 0 ? ' cost-produces' : ''}`}>{u.workforce.toLocaleString()}</td>
                      <td className={`num${u.superionicIce < 0 ? ' cost-produces' : ''}`}>{u.superionicIce.toLocaleString()}</td>
                      <td className={`num${u.magmaticGas < 0 ? ' cost-produces' : ''}`}>{u.magmaticGas.toLocaleString()}</td>
                      <td className="num">{u.startup.toLocaleString()}</td>
                      <td>
                        <button
                          type="button"
                          className="assigned__add"
                          onClick={() => void assign(u.name)}
                          disabled={working === u.name}
                          title={fits ? 'Assign' : 'Will exceed available capacity'}
                        >
                          {fits ? 'Assign' : 'Assign anyway'}
                        </button>
                      </td>
                    </tr>
                  ];
                  if (grants.length > 0) {
                    rows.push(
                      <tr key={`${u.name}-grants`} className="row-grants">
                        <td colSpan={7} className="row-grants__cell">→ {formatGrants(grants)}</td>
                      </tr>
                    );
                  }
                  return rows;
                })}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}

function BudgetBar({
  label,
  available,
  consumed,
  mode
}: {
  label: string;
  available: number;
  consumed: number;
  mode: ResourceMode;
}) {
  const usageRatio =
    available > 0 ? Math.min(consumed / available, 1) : consumed > 0 ? 1 : 0;
  const over = consumed > available;
  const fillRatio = mode === 'remaining' ? 1 - usageRatio : usageRatio;
  const overBy = consumed - available;

  // green (low usage) → yellow (50%) → red (100%); explicit red when over
  const hue = over ? 0 : 120 * (1 - usageRatio);
  const fillColor = over ? 'var(--danger)' : `hsl(${hue.toFixed(0)}, 65%, 50%)`;

  return (
    <div className="budget">
      <div className="budget__head">
        <span className="budget__label">{label}</span>
        <span className={`budget__values${over ? ' cost-over' : ''}`}>
          {consumed.toLocaleString()} / {available.toLocaleString()}
          {over && <span className="budget__over"> (over by {overBy.toLocaleString()})</span>}
        </span>
      </div>
      <div className={`budget__track${over ? ' budget__track--over' : ''}`}>
        <div
          className="budget__fill"
          style={{ width: `${fillRatio * 100}%`, background: fillColor }}
        />
      </div>
    </div>
  );
}

