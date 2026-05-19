import { useCallback, useEffect, useMemo, useState } from 'react';
import { evesov } from '@/api/evesov';
import { useUi } from '@/state/uiStore';
import type {
  DrillStructureType,
  MoonScan,
  MoonScanSession,
  ProfitabilityResult,
} from '@shared/index';

const DRILL_OPTIONS: DrillStructureType[] = ['Metenox', 'Athanor', 'Tatara'];

function moonKey(moonId: number): string {
  return `${moonId}`;
}

function formatIsk(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

const R_TIERS = [4, 8, 16, 32, 64] as const;

// Colour coding per R-tier
const TIER_COLORS: Record<number, string> = {
  4:  '#8b949e',
  8:  '#3fb950',
  16: '#58a6ff',
  32: '#d29922',
  64: '#f85149',
};

function tierLabel(oreType: string): string {
  const lower = oreType.toLowerCase();
  const tiers: [string, number][] = [
    ['zeolites', 4], ['bitumens', 4], ['sylvite', 4], ['coesite', 4],
    ['scheelite', 8], ['titanite', 8], ['cobaltite', 8], ['euxenite', 8],
    ['sperrylite', 16], ['chromite', 16], ['otavite', 16], ['vanadinite', 16],
    ['carnotite', 32], ['zircon', 32], ['pollucite', 32], ['cinnabar', 32],
    ['monazite', 64], ['loparite', 64], ['xenotime', 64], ['ytterbite', 64],
  ];
  for (const [name, tier] of tiers) {
    if (lower.includes(name)) return `R${tier}`;
  }
  return '?';
}

function tierColor(oreType: string): string {
  const label = tierLabel(oreType);
  const num = parseInt(label.slice(1), 10);
  return TIER_COLORS[num] ?? '#8b949e';
}

interface SystemMoons {
  systemId: number;
  systemName: string;
  moons: MoonScan[];
}

interface MoonGroup {
  moonId: number;
  moonNumber: number;
  ores: MoonScan[];
}

const ROMAN: Record<string, number> = {
  I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000,
};

function parseRoman(s: string): number {
  let result = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = ROMAN[s[i]] ?? 0;
    const next = ROMAN[s[i + 1]] ?? 0;
    result += cur < next ? -cur : cur;
  }
  return result;
}

function planetOrdinal(planetName: string | null): number {
  if (!planetName) return Infinity;
  const suffix = planetName.split(' ').at(-1) ?? '';
  const n = parseRoman(suffix.toUpperCase());
  return n > 0 ? n : Infinity;
}

function groupByMoon(scans: MoonScan[]): MoonGroup[] {
  const map = new Map<number, MoonGroup>();
  for (const scan of scans) {
    if (!map.has(scan.moonId)) {
      map.set(scan.moonId, { moonId: scan.moonId, moonNumber: scan.moonNumber, ores: [] });
    }
    map.get(scan.moonId)!.ores.push(scan);
  }
  return [...map.values()].sort((a, b) => {
    const pa = planetOrdinal(a.ores[0]?.planetName ?? null);
    const pb = planetOrdinal(b.ores[0]?.planetName ?? null);
    if (pa !== pb) return pa - pb;
    return a.moonNumber - b.moonNumber;
  });
}

function groupBySystem(scans: MoonScan[]): SystemMoons[] {
  const map = new Map<number, SystemMoons>();
  for (const scan of scans) {
    if (!map.has(scan.systemId)) {
      map.set(scan.systemId, { systemId: scan.systemId, systemName: scan.systemName, moons: [] });
    }
    map.get(scan.systemId)!.moons.push(scan);
  }
  return [...map.values()].sort((a, b) => a.systemName.localeCompare(b.systemName));
}

export function MoonScansPage() {
  const activePlanId = useUi((s) => s.activePlanId);
  const [sessions, setSessions] = useState<MoonScanSession[]>([]);
  const [scans, setScans] = useState<MoonScan[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [sessionsCollapsed, setSessionsCollapsed] = useState(true);
  const [filterTier, setFilterTier] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');
  const [drillTypes, setDrillTypes] = useState<Record<string, { systemId: number; structureType: DrillStructureType }>>({});
  const [profitability, setProfitability] = useState<Record<string, ProfitabilityResult | null>>({});
  const [hasMarketData, setHasMarketData] = useState(false);

  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [summaryTierFilter, setSummaryTierFilter] = useState<number | null>(null);
  const [summaryStructureFilter, setSummaryStructureFilter] = useState<DrillStructureType | 'All'>('All');
  const [summaryPlanOnly, setSummaryPlanOnly] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState<Set<number>>(new Set());
  const [planSystemIds, setPlanSystemIds] = useState<Set<number> | null>(null);

  const refresh = useCallback(async () => {
    const [s, sc, dt, hmd] = await Promise.all([
      evesov.moonScans.sessions(),
      evesov.moonScans.list(),
      evesov.moonScans.getDrillTypes(),
      evesov.data.hasMarketData(),
    ]);
    setSessions(s);
    setScans(sc);
    setCollapsed(new Set(sc.map((scan) => scan.systemId)));
    const map: Record<string, { systemId: number; structureType: DrillStructureType }> = {};
    for (const a of dt) map[moonKey(a.moonId)] = { systemId: a.systemId, structureType: a.structureType };
    setDrillTypes(map);
    setHasMarketData(hmd);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        Object.entries(drillTypes).map(async ([key, { structureType }]) => {
          const moonId = Number(key);
          const result = await evesov.moonScans.profitability(moonId, structureType);
          return [key, result] as const;
        }),
      );
      if (cancelled) return;
      setProfitability(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [drillTypes, hasMarketData]);

  const handleDrillTypeChange = async (
    moonId: number,
    systemId: number,
    value: string,
  ) => {
    const key = moonKey(moonId);
    const next = value === '' ? null : (value as DrillStructureType);
    await evesov.moonScans.setDrillType(moonId, systemId, next);
    setDrillTypes((prev) => {
      const copy = { ...prev };
      if (next === null) delete copy[key];
      else copy[key] = { systemId, structureType: next };
      return copy;
    });
    if (next === null) {
      setProfitability((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return evesov.events.on('data-refreshed', () => void refresh());
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (activePlanId == null) {
        setPlanSystemIds(null);
        return;
      }
      const ids = await evesov.plans.getSystemIds(activePlanId);
      if (!cancelled) setPlanSystemIds(new Set(ids));
    };
    void load();
    const off = evesov.events.on('plan-changed', () => void load());
    return () => {
      cancelled = true;
      off();
    };
  }, [activePlanId]);

  const summary = useMemo(() => {
    interface MoonRow {
      systemId: number;
      systemName: string;
      moonNumber: number;
      planetName: string | null;
      structureType: DrillStructureType;
      maxTier: number | null;
      profitPerHour: number | null;
    }
    const rows: MoonRow[] = [];
    const scansByMoon = new Map<string, MoonScan[]>();
    for (const sc of scans) {
      const k = moonKey(sc.moonId);
      if (!scansByMoon.has(k)) scansByMoon.set(k, []);
      scansByMoon.get(k)!.push(sc);
    }
    for (const [key, { systemId, structureType }] of Object.entries(drillTypes)) {
      const moonScans = scansByMoon.get(key);
      if (!moonScans || moonScans.length === 0) continue;
      const moonNumber = moonScans[0].moonNumber;
      if (summaryPlanOnly && planSystemIds && !planSystemIds.has(systemId)) continue;
      if (summaryStructureFilter !== 'All' && structureType !== summaryStructureFilter) continue;
      const tiers = moonScans
        .map((s) => parseInt(tierLabel(s.oreType).slice(1), 10))
        .filter((n) => !Number.isNaN(n));
      const maxTier = tiers.length > 0 ? Math.max(...tiers) : null;
      if (summaryTierFilter !== null && maxTier !== summaryTierFilter) continue;
      const prof = profitability[key];
      rows.push({
        systemId,
        systemName: moonScans[0].systemName,
        moonNumber,
        planetName: moonScans[0].planetName ?? null,
        structureType,
        maxTier,
        profitPerHour: prof ? prof.profitPerHour : null,
      });
    }
    const bySystem = new Map<
      number,
      { systemId: number; systemName: string; moons: MoonRow[]; totalProfit: number; hasMissing: boolean }
    >();
    for (const r of rows) {
      if (!bySystem.has(r.systemId)) {
        bySystem.set(r.systemId, {
          systemId: r.systemId,
          systemName: r.systemName,
          moons: [],
          totalProfit: 0,
          hasMissing: false,
        });
      }
      const g = bySystem.get(r.systemId)!;
      g.moons.push(r);
      if (r.profitPerHour == null) g.hasMissing = true;
      else g.totalProfit += r.profitPerHour;
    }
    const systems = [...bySystem.values()]
      .map((g) => ({
        ...g,
        moons: g.moons.sort((a, b) => {
          const pa = planetOrdinal(a.planetName);
          const pb = planetOrdinal(b.planetName);
          if (pa !== pb) return pa - pb;
          return a.moonNumber - b.moonNumber;
        }),
      }))
      .sort((a, b) => a.systemName.localeCompare(b.systemName));
    const totalProfit = systems.reduce((s, g) => s + g.totalProfit, 0);
    const totalMoons = systems.reduce((s, g) => s + g.moons.length, 0);
    const anyMissing = systems.some((g) => g.hasMissing);
    return { systems, totalProfit, totalMoons, anyMissing };
  }, [scans, drillTypes, profitability, summaryTierFilter, summaryStructureFilter, summaryPlanOnly, planSystemIds]);

  const toggleSummarySystem = (systemId: number) => {
    setSummaryExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(systemId)) next.delete(systemId);
      else next.add(systemId);
      return next;
    });
  };

  const handleImport = async () => {
    if (!pasteText.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await evesov.moonScans.import(pasteText.trim());
      setImportResult(
        `Imported ${result.moonsImported} moon${result.moonsImported !== 1 ? 's' : ''} across ${result.systemCount} system${result.systemCount !== 1 ? 's' : ''}.`,
      );
      setPasteText('');
      void refresh();
    } catch (e) {
      setImportResult(`Import failed: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteSession = (sessionId: number) => {
    if (!confirm('Delete this scan session? All moons imported in this session will be removed.')) return;
    void evesov.moonScans.deleteSession(sessionId).then(refresh);
  };

  const toggleCollapse = (systemId: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(systemId)) next.delete(systemId);
      else next.add(systemId);
      return next;
    });
  };

  const filteredScans = scans.filter((s) => {
    if (filterTier !== null && tierLabel(s.oreType) !== `R${filterTier}`) return false;
    if (searchText && !s.systemName.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  const systems = groupBySystem(filteredScans);

  return (
    <div className="moon-scans">
      <div className="moon-scans__import">
        <textarea
          className="moon-scans__paste"
          placeholder="Paste EVE moon survey clipboard here…"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={5}
        />
        <div className="moon-scans__import-row">
          <button
            type="button"
            className="moon-scans__btn"
            onClick={handleImport}
            disabled={importing || !pasteText.trim()}
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
          {importResult && <span className="moon-scans__import-result">{importResult}</span>}
        </div>
      </div>

      <div className="moon-scans__summary">
        <button
          type="button"
          className="moon-scans__section-label moon-scans__section-label--toggle"
          onClick={() => setSummaryCollapsed((v) => !v)}
        >
          <span className="moon-scans__system-toggle">{summaryCollapsed ? '▶' : '▼'}</span>
          Moon mining income
          <span className="moon-scans__summary-grand">
            {!hasMarketData
              ? 'Enable Data Sync'
              : summary.totalMoons === 0
                ? '— no drills assigned'
                : `${formatIsk(summary.totalProfit)} ISK/hr · ${summary.totalMoons} moon${summary.totalMoons !== 1 ? 's' : ''}${summary.anyMissing ? ' (pending prices)' : ''}`}
          </span>
        </button>
        {!summaryCollapsed && (
          <>
            <div className="moon-scans__summary-filters">
              <div className="moon-scans__tier-filter">
                <button
                  type="button"
                  className={`moon-scans__tier-btn${summaryTierFilter === null ? ' moon-scans__tier-btn--active' : ''}`}
                  onClick={() => setSummaryTierFilter(null)}
                >
                  All
                </button>
                {R_TIERS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`moon-scans__tier-btn${summaryTierFilter === t ? ' moon-scans__tier-btn--active' : ''}`}
                    style={{ color: TIER_COLORS[t] }}
                    onClick={() => setSummaryTierFilter(summaryTierFilter === t ? null : t)}
                    title={`Include moons whose highest-tier ore is R${t}`}
                  >
                    R{t}
                  </button>
                ))}
              </div>
              <select
                className="moon-scans__drill-select"
                value={summaryStructureFilter}
                onChange={(e) =>
                  setSummaryStructureFilter(e.target.value as DrillStructureType | 'All')
                }
              >
                <option value="All">All structures</option>
                {DRILL_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <label
                className={`moon-scans__plan-only${activePlanId == null ? ' moon-scans__plan-only--disabled' : ''}`}
                title={activePlanId == null ? 'Activate a plan to enable this filter' : 'Only count moons in systems within the active plan scope'}
              >
                <input
                  type="checkbox"
                  checked={summaryPlanOnly && activePlanId != null}
                  disabled={activePlanId == null}
                  onChange={(e) => setSummaryPlanOnly(e.target.checked)}
                />
                Active plan systems only
              </label>
            </div>
            {summary.systems.length === 0 ? (
              <div className="moon-scans__empty">No drill assignments match the current filters.</div>
            ) : (
              <div className="moon-scans__summary-list">
                {summary.systems.map((g) => {
                  const expanded = summaryExpanded.has(g.systemId);
                  return (
                    <div key={g.systemId} className="moon-scans__summary-system">
                      <button
                        type="button"
                        className="moon-scans__summary-row"
                        onClick={() => toggleSummarySystem(g.systemId)}
                      >
                        <span className="moon-scans__system-toggle">{expanded ? '▼' : '▶'}</span>
                        <span className="moon-scans__system-name">{g.systemName}</span>
                        <span className="moon-scans__system-count">
                          {g.moons.length} moon{g.moons.length !== 1 ? 's' : ''}
                        </span>
                        <span className="moon-scans__profit">
                          {!hasMarketData
                            ? 'Enable Data Sync'
                            : `${formatIsk(g.totalProfit)} ISK/hr${g.hasMissing ? ' *' : ''}`}
                        </span>
                      </button>
                      {expanded && (
                        <div className="moon-scans__summary-detail">
                          {g.moons.map((m) => (
                            <div
                              key={`${m.systemId}:${m.moonNumber}`}
                              className="moon-scans__summary-moon"
                            >
                              <span className="moon-scans__moon-num">
                                {m.planetName
                                  ? `${m.planetName} - Moon ${m.moonNumber}`
                                  : `Moon ${m.moonNumber}`}
                              </span>
                              {m.maxTier != null && (
                                <span
                                  className="moon-scans__tier-badge"
                                  style={{ color: TIER_COLORS[m.maxTier] }}
                                >
                                  R{m.maxTier}
                                </span>
                              )}
                              <span className="moon-scans__summary-structure">
                                {m.structureType}
                              </span>
                              <span className="moon-scans__profit">
                                {!hasMarketData
                                  ? '—'
                                  : m.profitPerHour != null
                                    ? `${formatIsk(m.profitPerHour)} ISK/hr`
                                    : '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {sessions.length > 0 && (
        <div className="moon-scans__sessions">
          <button
            type="button"
            className="moon-scans__section-label moon-scans__section-label--toggle"
            onClick={() => setSessionsCollapsed((v) => !v)}
          >
            <span className="moon-scans__system-toggle">{sessionsCollapsed ? '▶' : '▼'}</span>
            Import sessions ({sessions.length})
          </button>
          {!sessionsCollapsed && sessions.map((session) => (
            <div key={session.id} className="moon-scans__session-row">
              <span className="moon-scans__session-date">
                {new Date(session.importedAt).toLocaleString()}
              </span>
              <span className="moon-scans__session-count">{session.systemCount} systems</span>
              <button
                type="button"
                className="moon-scans__btn moon-scans__btn--danger"
                onClick={() => handleDeleteSession(session.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="moon-scans__filters">
        <input
          type="search"
          placeholder="Search systems…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="moon-scans__search"
        />
        <div className="moon-scans__tier-filter">
          <button
            type="button"
            className={`moon-scans__tier-btn${filterTier === null ? ' moon-scans__tier-btn--active' : ''}`}
            onClick={() => setFilterTier(null)}
          >
            All
          </button>
          {R_TIERS.map((t) => (
            <button
              key={t}
              type="button"
              className={`moon-scans__tier-btn${filterTier === t ? ' moon-scans__tier-btn--active' : ''}`}
              style={{ color: TIER_COLORS[t] }}
              onClick={() => setFilterTier(filterTier === t ? null : t)}
            >
              R{t}
            </button>
          ))}
        </div>
      </div>

      {scans.length === 0 ? (
        <div className="moon-scans__empty">No moon scans imported yet.</div>
      ) : systems.length === 0 ? (
        <div className="moon-scans__empty">No moons match the current filter.</div>
      ) : (
        <div className="moon-scans__systems">
          {systems.map(({ systemId, systemName, moons }) => (
            <div key={systemId} className="moon-scans__system">
              <button
                type="button"
                className="moon-scans__system-header"
                onClick={() => toggleCollapse(systemId)}
              >
                <span className="moon-scans__system-toggle">
                  {collapsed.has(systemId) ? '▶' : '▼'}
                </span>
                <span className="moon-scans__system-name">{systemName}</span>
                <span className="moon-scans__system-count">{new Set(moons.map((m) => m.moonNumber)).size} moon{new Set(moons.map((m) => m.moonNumber)).size !== 1 ? 's' : ''}</span>
                <span className="moon-scans__system-tiers">
                  {R_TIERS.map((t) => {
                    const count = moons.filter((m) => tierLabel(m.oreType) === `R${t}`).length;
                    if (!count) return null;
                    return (
                      <span key={t} className="moon-scans__tier-badge" style={{ color: TIER_COLORS[t] }}>
                        R{t}×{count}
                      </span>
                    );
                  })}
                </span>
              </button>
              {!collapsed.has(systemId) && (
                <div className="moon-scans__moon-list">
                  {groupByMoon(moons).map(({ moonId, moonNumber, ores }) => {
                    const key = moonKey(moonId);
                    const drillType = drillTypes[key]?.structureType ?? '';
                    const prof = profitability[key];
                    return (
                    <div key={moonId} className="moon-scans__moon">
                      <div className="moon-scans__moon-header">
                        <span className="moon-scans__moon-num">
                          {ores[0]?.planetName
                            ? `${ores[0].planetName} - Moon ${moonNumber}`
                            : `Moon ${moonNumber}`}
                        </span>
                        <span className="moon-scans__moon-tiers">
                          {R_TIERS.map((t) => {
                            const count = ores.filter((o) => tierLabel(o.oreType) === `R${t}`).length;
                            if (!count) return null;
                            return (
                              <span key={t} className="moon-scans__tier-badge" style={{ color: TIER_COLORS[t] }}>
                                R{t}
                              </span>
                            );
                          })}
                        </span>
                        {drillType && (
                          <span className="moon-scans__profit">
                            {!hasMarketData
                              ? 'Enable Data Sync'
                              : prof
                                ? `${formatIsk(prof.profitPerHour)} ISK/hr`
                                : '—'}
                          </span>
                        )}
                        <select
                          className="moon-scans__drill-select"
                          value={drillType}
                          onChange={(e) =>
                            void handleDrillTypeChange(moonId, systemId, e.target.value)
                          }
                        >
                          <option value="">— None —</option>
                          {DRILL_OPTIONS.map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      {ores.map((ore) => (
                        <div key={ore.id} className="moon-scans__ore-row">
                          <span
                            className="moon-scans__tier-pill"
                            style={{ color: tierColor(ore.oreType) }}
                          >
                            {tierLabel(ore.oreType)}
                          </span>
                          <span className="moon-scans__ore-name">{ore.oreType}</span>
                          <div className="moon-scans__ore-bar-wrap">
                            <div
                              className="moon-scans__ore-bar"
                              style={{
                                width: `${(ore.orePercent * 100).toFixed(1)}%`,
                                background: tierColor(ore.oreType),
                              }}
                            />
                          </div>
                          <span className="moon-scans__ore-pct">
                            {(ore.orePercent * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
