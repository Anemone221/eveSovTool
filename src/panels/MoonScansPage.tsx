import { useCallback, useEffect, useState } from 'react';
import { evesov } from '@/api/evesov';
import type { MoonScan, MoonScanSession } from '@shared/index';

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
    if (!map.has(scan.moonNumber)) {
      map.set(scan.moonNumber, { moonNumber: scan.moonNumber, ores: [] });
    }
    map.get(scan.moonNumber)!.ores.push(scan);
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
  const [sessions, setSessions] = useState<MoonScanSession[]>([]);
  const [scans, setScans] = useState<MoonScan[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [sessionsCollapsed, setSessionsCollapsed] = useState(true);
  const [filterTier, setFilterTier] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');

  const refresh = useCallback(async () => {
    const [s, sc] = await Promise.all([evesov.moonScans.sessions(), evesov.moonScans.list()]);
    setSessions(s);
    setScans(sc);
    setCollapsed(new Set(sc.map((scan) => scan.systemId)));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return evesov.events.on('data-refreshed', () => void refresh());
  }, [refresh]);

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
                  {groupByMoon(moons).map(({ moonNumber, ores }) => (
                    <div key={moonNumber} className="moon-scans__moon">
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
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
