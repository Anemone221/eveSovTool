import { useEffect, useMemo, useState } from 'react';
import { evesov } from '@/api/evesov';
import { useUi } from '@/state/uiStore';
import { useActivePlanScopes } from '@/state/useActivePlanScopes';
import type { TreeNodeRegion, TreeNodeConstellation, TreeNodeSystem } from '@shared/index';

export function TreeExplorer() {
  const [tree, setTree] = useState<TreeNodeRegion[]>([]);
  const [filter, setFilter] = useState('');
  const [openRegions, setOpenRegions] = useState<Set<number>>(new Set());
  const [openConstellations, setOpenConstellations] = useState<Set<number>>(new Set());
  const selectSystem = useUi((s) => s.selectSystem);
  const selectedSystemId = useUi((s) => s.selectedSystemId);
  const activePlanId = useUi((s) => s.activePlanId);
  const planScopes = useActivePlanScopes();

  useEffect(() => {
    void evesov.data.tree().then(setTree);
  }, []);

  const filtered = useMemo(() => {
    if (!filter.trim()) return tree;
    const q = filter.toLowerCase();
    const matchSystem = (s: TreeNodeSystem) => s.name.toLowerCase().includes(q);
    return tree
      .map((r) => {
        const constellations = r.constellations
          .map((c) => {
            const systems = c.systems.filter(matchSystem);
            const cMatches = c.name.toLowerCase().includes(q);
            return cMatches ? c : systems.length ? { ...c, systems } : null;
          })
          .filter((c): c is TreeNodeConstellation => c !== null);
        const rMatches = r.name.toLowerCase().includes(q);
        if (rMatches) return r;
        return constellations.length ? { ...r, constellations } : null;
      })
      .filter((r): r is TreeNodeRegion => r !== null);
  }, [tree, filter]);

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
      <input
        type="search"
        className="tree__filter"
        placeholder="Filter regions, constellations, systems…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="tree__body">
        {filtered.map((r) => {
          const open = isFiltering || openRegions.has(r.id);
          return (
            <div key={r.id} className="tree__region">
              <div className="tree__row tree__row--region">
                <button className="tree__expand" onClick={() => toggleRegion(r.id)}>
                  <span className="tree__chevron">{open ? '▾' : '▸'}</span>
                  <span>{r.name}</span>
                  <span className="tree__count">{r.constellations.length}</span>
                </button>
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
                          <span className="tree__count">{c.systems.length}</span>
                        </button>
                        <ScopeButton
                          inScope={inScope}
                          implicit={!planScopes.has('constellation', c.id) && inScope}
                          disabled={activePlanId === null || planScopes.has('region', r.id)}
                          onClick={() => void planScopes.toggle('constellation', c.id)}
                          title="constellation"
                        />
                      </div>
                      {cOpen &&
                        c.systems.map((s) => {
                          const sysImplicit =
                            planScopes.has('region', r.id) || planScopes.has('constellation', c.id);
                          const sysExplicit = planScopes.has('system', s.id);
                          const sysInScope = sysImplicit || sysExplicit;
                          return (
                            <div key={s.id} className="tree__row tree__row--system-wrap">
                              <button
                                className={`tree__expand tree__row--system${
                                  selectedSystemId === s.id ? ' tree__row--active' : ''
                                }${s.sovEligible ? '' : ' tree__row--non-sov'}`}
                                onClick={() => selectSystem(s.id)}
                                title={s.sovEligible ? 'sov-eligible' : 'no sov data'}
                              >
                                <span className="tree__sec">{formatSec(s.securityStatus)}</span>
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
                        })}
                    </div>
                  );
                })}
            </div>
          );
        })}
        {tree.length === 0 && <div className="tree__empty">Loading…</div>}
      </div>
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

function formatSec(sec: number | null): string {
  if (sec === null || sec === undefined) return '   ';
  const rounded = Math.round(sec * 10) / 10;
  return rounded.toFixed(1);
}
