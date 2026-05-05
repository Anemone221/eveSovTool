import { useEffect, useMemo, useState } from 'react';
import { evesov } from '@/api/evesov';
import { useUi } from '@/state/uiStore';
import { useActivePlanScopes } from '@/state/useActivePlanScopes';
import type { TreeNodeRegion, TreeNodeConstellation, TreeNodeSystem } from '@shared/index';

const PREF_SOV_ONLY = 'tree.sovOnly';
const PREF_CLAIMED_ONLY = 'tree.claimedOnly';
const PREF_GROUP_CLAIMED = 'tree.group.claimed';
const PREF_GROUP_UNCLAIMED = 'tree.group.unclaimed';
const PREF_GROUP_OTHER = 'tree.group.other';

type GroupKey = 'claimed' | 'unclaimed' | 'other';

export function TreeExplorer() {
  const [tree, setTree] = useState<TreeNodeRegion[]>([]);
  const [filter, setFilter] = useState('');
  const [sovOnly, setSovOnlyState] = useState(true);
  const [claimedOnly, setClaimedOnlyState] = useState(false);
  const [groupOpen, setGroupOpenState] = useState<Record<GroupKey, boolean>>({
    claimed: true,
    unclaimed: true,
    other: false
  });
  const [openRegions, setOpenRegions] = useState<Set<number>>(new Set());
  const [openConstellations, setOpenConstellations] = useState<Set<number>>(new Set());
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    systemId: number;
    systemName: string;
  } | null>(null);
  const selectSystem = useUi((s) => s.selectSystem);
  const selectedSystemId = useUi((s) => s.selectedSystemId);
  const activePlanId = useUi((s) => s.activePlanId);
  const planScopes = useActivePlanScopes();

  useEffect(() => {
    void evesov.data.tree().then(setTree);
    void evesov.prefs.get(PREF_SOV_ONLY).then((v) => {
      if (v !== null) setSovOnlyState(v === 'true');
    });
    void evesov.prefs.get(PREF_CLAIMED_ONLY).then((v) => {
      if (v === 'true') setClaimedOnlyState(true);
    });
    void Promise.all([
      evesov.prefs.get(PREF_GROUP_CLAIMED),
      evesov.prefs.get(PREF_GROUP_UNCLAIMED),
      evesov.prefs.get(PREF_GROUP_OTHER)
    ]).then(([claimed, unclaimed, other]) => {
      setGroupOpenState({
        claimed: claimed === null ? true : claimed === 'true',
        unclaimed: unclaimed === null ? true : unclaimed === 'true',
        other: other === null ? false : other === 'true'
      });
    });
  }, []);

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

  const setGroupOpen = (key: GroupKey, v: boolean) => {
    setGroupOpenState((prev) => ({ ...prev, [key]: v }));
    const prefKey =
      key === 'claimed'
        ? PREF_GROUP_CLAIMED
        : key === 'unclaimed'
          ? PREF_GROUP_UNCLAIMED
          : PREF_GROUP_OTHER;
    void evesov.prefs.set(prefKey, v ? 'true' : 'false');
  };

  const setSovOnly = (v: boolean) => {
    setSovOnlyState(v);
    void evesov.prefs.set(PREF_SOV_ONLY, v ? 'true' : 'false');
  };
  const setClaimedOnly = (v: boolean) => {
    setClaimedOnlyState(v);
    void evesov.prefs.set(PREF_CLAIMED_ONLY, v ? 'true' : 'false');
  };

  const counts = useMemo(() => {
    const regionCounts = new Map<number, { claimed: number; total: number }>();
    const constCounts = new Map<number, { claimed: number; total: number }>();
    for (const r of tree) {
      const regionInScope = planScopes.has('region', r.id);
      let rClaimed = 0;
      let rTotal = 0;
      for (const c of r.constellations) {
        const cInScope = regionInScope || planScopes.has('constellation', c.id);
        let cClaimed = 0;
        let cTotal = 0;
        for (const s of c.systems) {
          if (!s.sovEligible) continue;
          cTotal++;
          if (cInScope || planScopes.has('system', s.id)) cClaimed++;
        }
        constCounts.set(c.id, { claimed: cClaimed, total: cTotal });
        rClaimed += cClaimed;
        rTotal += cTotal;
      }
      regionCounts.set(r.id, { claimed: rClaimed, total: rTotal });
    }
    return { regionCounts, constCounts };
  }, [tree, planScopes.scopes]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const hasText = q.length > 0;
    const hasOther = sovOnly || claimedOnly;
    if (!hasText && !hasOther) return tree;

    const isInScope = (rId: number, cId: number, sId: number) =>
      planScopes.has('region', rId) ||
      planScopes.has('constellation', cId) ||
      planScopes.has('system', sId);
    const sysOk = (s: TreeNodeSystem, rId: number, cId: number) => {
      if (sovOnly && !s.sovEligible) return false;
      if (claimedOnly && !isInScope(rId, cId, s.id)) return false;
      return true;
    };

    return tree
      .map((r) => {
        const rMatches = hasText && r.name.toLowerCase().includes(q);
        const constellations = r.constellations
          .map((c) => {
            const cMatches = hasText && c.name.toLowerCase().includes(q);
            const systems = c.systems.filter((s) => {
              if (!sysOk(s, r.id, c.id)) return false;
              if (!hasText || rMatches || cMatches) return true;
              return s.name.toLowerCase().includes(q);
            });
            return systems.length ? { ...c, systems } : null;
          })
          .filter((c): c is TreeNodeConstellation => c !== null);
        return constellations.length ? { ...r, constellations } : null;
      })
      .filter((r): r is TreeNodeRegion => r !== null);
  }, [tree, filter, sovOnly, claimedOnly, planScopes.scopes]);

  const toggleRegion = (id: number) =>
    setOpenRegions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleConstellation = (id: number) =>
    setOpenConstellations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const isFiltering = filter.trim().length > 0;

  return (
    <div className="tree">
      <div className="tree__filters">
        <input
          type="search"
          className="tree__filter"
          placeholder="Filter regions, constellations, systems…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button
          type="button"
          className={`tree__toggle${sovOnly ? ' tree__toggle--on' : ''}`}
          onClick={() => setSovOnly(!sovOnly)}
          title="Show only sov-eligible systems"
        >
          Sov
        </button>
        <button
          type="button"
          className={`tree__toggle${claimedOnly ? ' tree__toggle--on' : ''}`}
          onClick={() => setClaimedOnly(!claimedOnly)}
          disabled={activePlanId === null}
          title={
            activePlanId === null
              ? 'Activate a plan to filter by claimed'
              : 'Show only systems claimed in the active plan'
          }
        >
          Claimed
        </button>
      </div>
      <div className="tree__body">
        {filtered.map((r) => {
          const open = isFiltering || openRegions.has(r.id);
          return (
            <div key={r.id} className="tree__region">
              <div className="tree__row tree__row--region">
                <button className="tree__expand" onClick={() => toggleRegion(r.id)}>
                  <span className="tree__chevron">{open ? '▾' : '▸'}</span>
                  <span>{r.name}</span>
                  <CountBadge value={counts.regionCounts.get(r.id)} fallback={r.constellations.length} />
                </button>
                {activePlanId !== null && planScopes.has('region', r.id) && (
                  <ExplodeButton
                    title={`Explode ${r.name} into per-system scopes`}
                    onClick={() =>
                      void evesov.plans.explodeScope(activePlanId, 'region', r.id)
                    }
                  />
                )}
                <ScopeButton
                  inScope={planScopes.has('region', r.id)}
                  disabled={activePlanId === null}
                  onClick={() => void planScopes.toggle('region', r.id)}
                  title="region"
                />
              </div>
              {open &&
                r.constellations.map((c) => {
                  const cOpen = isFiltering || openConstellations.has(c.id);
                  const inScope =
                    planScopes.has('region', r.id) || planScopes.has('constellation', c.id);
                  return (
                    <div key={c.id}>
                      <div className="tree__row tree__row--constellation">
                        <button className="tree__expand" onClick={() => toggleConstellation(c.id)}>
                          <span className="tree__chevron">{cOpen ? '▾' : '▸'}</span>
                          <span>{c.name}</span>
                          <CountBadge value={counts.constCounts.get(c.id)} fallback={c.systems.length} />
                        </button>
                        {activePlanId !== null &&
                          planScopes.has('constellation', c.id) &&
                          !planScopes.has('region', r.id) && (
                            <ExplodeButton
                              title={`Explode ${c.name} into per-system scopes`}
                              onClick={() =>
                                void evesov.plans.explodeScope(
                                  activePlanId,
                                  'constellation',
                                  c.id
                                )
                              }
                            />
                          )}
                        <ScopeButton
                          inScope={inScope}
                          implicit={!planScopes.has('constellation', c.id) && inScope}
                          disabled={activePlanId === null || planScopes.has('region', r.id)}
                          onClick={() => void planScopes.toggle('constellation', c.id)}
                          title="constellation"
                        />
                      </div>
                      {cOpen && (() => {
                        const claimedArr: TreeNodeSystem[] = [];
                        const unclaimedArr: TreeNodeSystem[] = [];
                        const otherArr: TreeNodeSystem[] = [];
                        const cInScope =
                          planScopes.has('region', r.id) || planScopes.has('constellation', c.id);
                        for (const s of c.systems) {
                          if (!s.sovEligible) otherArr.push(s);
                          else if (cInScope || planScopes.has('system', s.id))
                            claimedArr.push(s);
                          else unclaimedArr.push(s);
                        }
                        const renderRow = (s: TreeNodeSystem) => {
                          const sysImplicit =
                            planScopes.has('region', r.id) ||
                            planScopes.has('constellation', c.id);
                          const sysExplicit = planScopes.has('system', s.id);
                          const sysInScope = sysImplicit || sysExplicit;
                          return (
                            <div key={s.id} className="tree__row tree__row--system-wrap">
                              <button
                                className={`tree__expand tree__row--system${
                                  selectedSystemId === s.id ? ' tree__row--active' : ''
                                }${s.sovEligible ? '' : ' tree__row--non-sov'}`}
                                onClick={() => selectSystem(s.id)}
                                onContextMenu={(e) => {
                                  if (activePlanId === null) return;
                                  e.preventDefault();
                                  setMenu({ x: e.clientX, y: e.clientY, systemId: s.id, systemName: s.name });
                                }}
                                title={s.sovEligible ? 'sov-eligible' : 'no sov data'}
                              >
                                <span className="tree__sec">{formatSec(s.securityStatus)}</span>
                                {planScopes.isCapital(s.id) && (
                                  <span className="tree__capital" title="Plan capital">⚑</span>
                                )}
                                <span>{s.name}</span>
                              </button>
                              <ScopeButton
                                inScope={sysInScope}
                                implicit={sysImplicit && !sysExplicit}
                                disabled={activePlanId === null || sysImplicit}
                                onClick={() => void planScopes.toggle('system', s.id)}
                                title="system"
                              />
                            </div>
                          );
                        };
                        return (
                          <>
                            <SystemGroup
                              groupKey="claimed"
                              label="Claimed"
                              systems={claimedArr}
                              open={isFiltering || groupOpen.claimed}
                              onToggle={() => setGroupOpen('claimed', !groupOpen.claimed)}
                              renderRow={renderRow}
                            />
                            <SystemGroup
                              groupKey="unclaimed"
                              label="Unclaimed"
                              systems={unclaimedArr}
                              open={isFiltering || groupOpen.unclaimed}
                              onToggle={() => setGroupOpen('unclaimed', !groupOpen.unclaimed)}
                              renderRow={renderRow}
                            />
                            <SystemGroup
                              groupKey="other"
                              label="Other"
                              systems={otherArr}
                              open={isFiltering || groupOpen.other}
                              onToggle={() => setGroupOpen('other', !groupOpen.other)}
                              renderRow={renderRow}
                            />
                          </>
                        );
                      })()}
                    </div>
                  );
                })}
            </div>
          );
        })}
        {tree.length === 0 && <div className="tree__empty">Loading…</div>}
      </div>
      {menu && activePlanId !== null && (
        <div
          className="context-menu"
          style={{ top: menu.y, left: menu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {planScopes.isCapital(menu.systemId) ? (
            <button
              type="button"
              className="context-menu__item"
              onClick={() => {
                void evesov.plans.setCapital(activePlanId, menu.systemId, false);
                setMenu(null);
              }}
            >
              Clear capital ({menu.systemName})
            </button>
          ) : (
            <button
              type="button"
              className="context-menu__item"
              onClick={() => {
                void evesov.plans.setCapital(activePlanId, menu.systemId, true);
                setMenu(null);
              }}
            >
              Set as capital ({menu.systemName})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ScopeButton({
  inScope,
  implicit = false,
  disabled = false,
  onClick,
  title
}: {
  inScope: boolean;
  implicit?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}) {
  const label = implicit ? '✓' : inScope ? '✓' : '+';
  const classes = ['tree__scope'];
  if (inScope) classes.push('tree__scope--in');
  if (implicit) classes.push('tree__scope--implicit');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      title={
        disabled
          ? implicit
            ? `Included via parent ${title === 'system' ? 'region/constellation' : 'region'}`
            : 'Activate a plan to add scopes'
          : inScope
            ? `Remove ${title} from plan`
            : `Add ${title} to plan`
      }
    >
      {label}
    </button>
  );
}

function ExplodeButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="tree__explode"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      aria-label={title}
    >
      ⤬
    </button>
  );
}

function SystemGroup({
  groupKey,
  label,
  systems,
  open,
  onToggle,
  renderRow
}: {
  groupKey: GroupKey;
  label: string;
  systems: TreeNodeSystem[];
  open: boolean;
  onToggle: () => void;
  renderRow: (s: TreeNodeSystem) => JSX.Element;
}) {
  if (systems.length === 0) return null;
  return (
    <div className={`tree__group tree__group--${groupKey}`}>
      <button type="button" className="tree__group-header" onClick={onToggle}>
        <span className="tree__chevron">{open ? '▾' : '▸'}</span>
        <span className="tree__group-label">{label}</span>
        <span className="tree__count">{systems.length}</span>
      </button>
      {open && systems.map(renderRow)}
    </div>
  );
}

function CountBadge({
  value,
  fallback
}: {
  value: { claimed: number; total: number } | undefined;
  fallback: number;
}) {
  if (value && value.total > 0) {
    const full = value.claimed === value.total;
    return (
      <span className={`tree__count${full ? ' tree__count--full' : ''}`}>
        {value.claimed}/{value.total}
      </span>
    );
  }
  return <span className="tree__count">{fallback}</span>;
}

function formatSec(sec: number | null): string {
  if (sec === null || sec === undefined) return '   ';
  const rounded = Math.round(sec * 10) / 10;
  return rounded.toFixed(1);
}
