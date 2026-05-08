import html2canvas from 'html2canvas';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evesov } from '@/api/evesov';
import { useUi } from '@/state/uiStore';
import { OpsecPill } from '@/components/OpsecPill';
import { useEffectiveOpsec, useOpsec } from '@/state/opsecStore';
import { useExportRegistry } from '@/state/exportRegistry';
import { buildExportFilename } from '@/data/exportFilename';
import { withOpsecCapture } from '@/data/opsecCapture';
import { FormatBar } from '@/components/FormatBar';
import { compareSites, siteEffectsFor } from '@/data/effects';
import { badgesForUpgrades } from '@/data/systemEffects';
import { CATEGORY_ORDER, categoryOf, type UpgradeCategory } from '@/data/upgradeCategories';
import type { PlanMatrix } from '@shared/index';

const FMT_KEYS = ['verticalHeaders', 'breakout'] as const;
type FmtKey = (typeof FMT_KEYS)[number];

const FMT_LABELS: Record<FmtKey, string> = {
  verticalHeaders: 'Vertical headers',
  breakout: 'Break out by category',
};

const FMT_PREF_PREFIX = 'sites.fmt.';

interface SystemRow {
  id: number;
  name: string;
  constellationName: string;
  regionName: string;
  sites: Map<string, number>;
  upgradeNames: string[];
}

interface CategoryGroup {
  category: UpgradeCategory;
  rows: SystemRow[];
  columns: string[];
  totals: Map<string, number>;
}

interface DisplaySection {
  key: string;
  heading: string | null;
  rows: SystemRow[];
  columns: string[];
  totals: Map<string, number>;
  segments: { category: UpgradeCategory; columns: string[] }[];
}

export function SitesOverview() {
  const activePlanId = useUi((s) => s.activePlanId);
  const selectSystem = useUi((s) => s.selectSystem);
  const [matrix, setMatrix] = useState<PlanMatrix | null>(null);
  const [fmt, setFmt] = useState<Record<FmtKey, boolean>>({
    verticalHeaders: false,
    breakout: true,
  });
  const matrixRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void Promise.all(FMT_KEYS.map((k) => evesov.prefs.get(FMT_PREF_PREFIX + k))).then((vals) => {
      setFmt((prev) => {
        const next = { ...prev };
        FMT_KEYS.forEach((k, i) => {
          if (vals[i] !== null) next[k] = vals[i] === '1';
        });
        return next;
      });
    });
  }, []);

  const onFmtChange = useCallback((key: FmtKey, value: boolean) => {
    setFmt((prev) => ({ ...prev, [key]: value }));
    void evesov.prefs.set(FMT_PREF_PREFIX + key, value ? '1' : '0');
  }, []);
  const opsec = useEffectiveOpsec();
  const systemNameById = useMemo(() => {
    const map = new Map<number, string>();
    if (matrix) matrix.systems.forEach((s, i) => map.set(s.id, `System-${i + 1}`));
    return map;
  }, [matrix]);
  const renderSystemName = useCallback(
    (id: number, real: string) =>
      opsec.hideSystemNames ? (systemNameById.get(id) ?? real) : real,
    [opsec.hideSystemNames, systemNameById]
  );

  const onExportPng = useCallback(async () => {
    const el = matrixRef.current;
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
    const filename = buildExportFilename({ planName: got.plan.name, panel: 'sites' });
    await evesov.exports.capturePng(filename, dataUrl, {
      planId: activePlanId,
      planName: got.plan.name,
      panel: 'sites',
      opsecPreset: useOpsec.getState().preset
    });
  }, [activePlanId]);

  useEffect(() => {
    useExportRegistry.getState().register('sites', onExportPng);
    return () => useExportRegistry.getState().unregister('sites');
  }, [onExportPng]);

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

  const groups = useMemo<CategoryGroup[]>(() => {
    if (!matrix) return [];
    const perCategory = new Map<
      UpgradeCategory,
      { rows: SystemRow[]; colSet: Set<string>; totals: Map<string, number> }
    >();
    for (const s of matrix.systems) {
      const sitesByCat = new Map<UpgradeCategory, Map<string, number>>();
      for (const upg of s.upgrades) {
        const grants = siteEffectsFor(upg.name, s.securityStatus);
        if (grants.length === 0) continue;
        const cat = categoryOf(upg.name);
        let m = sitesByCat.get(cat);
        if (!m) {
          m = new Map();
          sitesByCat.set(cat, m);
        }
        for (const g of grants) m.set(g.site, (m.get(g.site) ?? 0) + g.count);
      }
      const upgradeNames = s.upgrades.map((u) => u.name);
      for (const [cat, sites] of sitesByCat) {
        let entry = perCategory.get(cat);
        if (!entry) {
          entry = { rows: [], colSet: new Set(), totals: new Map() };
          perCategory.set(cat, entry);
        }
        entry.rows.push({
          id: s.id,
          name: s.name,
          constellationName: s.constellationName,
          regionName: s.regionName,
          sites,
          upgradeNames
        });
        for (const [site, count] of sites) {
          entry.colSet.add(site);
          entry.totals.set(site, (entry.totals.get(site) ?? 0) + count);
        }
      }
    }
    return CATEGORY_ORDER.filter((c) => perCategory.has(c)).map((c) => {
      const e = perCategory.get(c)!;
      return {
        category: c,
        rows: e.rows,
        columns: Array.from(e.colSet).sort(compareSites),
        totals: e.totals
      };
    });
  }, [matrix]);

  const sections = useMemo<DisplaySection[]>(() => {
    if (fmt.breakout) {
      return groups.map((g) => ({
        key: g.category,
        heading: g.category,
        rows: g.rows,
        columns: g.columns,
        totals: g.totals,
        segments: [{ category: g.category, columns: g.columns }],
      }));
    }
    if (groups.length === 0) return [];
    const totals = new Map<string, number>();
    const rowsById = new Map<number, SystemRow>();
    const segments: { category: UpgradeCategory; columns: string[] }[] = [];
    const flatCols: string[] = [];
    for (const g of groups) {
      segments.push({ category: g.category, columns: g.columns });
      for (const c of g.columns) flatCols.push(c);
      for (const [site, count] of g.totals) {
        totals.set(site, (totals.get(site) ?? 0) + count);
      }
      for (const r of g.rows) {
        let merged = rowsById.get(r.id);
        if (!merged) {
          merged = {
            id: r.id,
            name: r.name,
            constellationName: r.constellationName,
            regionName: r.regionName,
            sites: new Map(),
            upgradeNames: r.upgradeNames,
          };
          rowsById.set(r.id, merged);
        }
        for (const [site, count] of r.sites) {
          merged.sites.set(site, (merged.sites.get(site) ?? 0) + count);
        }
      }
    }
    return [
      {
        key: 'all',
        heading: null,
        rows: Array.from(rowsById.values()),
        columns: flatCols,
        totals,
        segments,
      },
    ];
  }, [groups, fmt.breakout]);

  const { totalSystems, totalSiteTypes, grandTotal } = useMemo(() => {
    const sysIds = new Set<number>();
    const siteNames = new Set<string>();
    let grand = 0;
    for (const g of groups) {
      for (const r of g.rows) sysIds.add(r.id);
      for (const c of g.columns) siteNames.add(c);
      for (const v of g.totals.values()) grand += v;
    }
    return { totalSystems: sysIds.size, totalSiteTypes: siteNames.size, grandTotal: grand };
  }, [groups]);

  if (activePlanId === null) {
    return <div className="overview overview--empty">Activate a plan to see sites overview.</div>;
  }
  if (!matrix) return <div className="overview overview--empty">Loading…</div>;
  if (groups.length === 0) {
    return (
      <div className="overview overview--empty">
        No site-granting upgrades assigned yet (Threat Detection or Prospecting Arrays).
      </div>
    );
  }

  return (
    <div className="overview">
      <header className="overview__header">
        <h2>Sites overview</h2>
        <span className="overview__meta">
          {totalSystems} systems · {totalSiteTypes} site types · {grandTotal.toLocaleString()} total sites
        </span>
      </header>
      <FormatBar keys={FMT_KEYS} labels={FMT_LABELS} values={fmt} onChange={onFmtChange} />
      <div className="format-bar__actions">
        <OpsecPill />
        <button type="button" className="matrix__export-btn" onClick={onExportPng}>Export PNG</button>
      </div>

      <div ref={matrixRef}>
        {sections.map((sec) => {
          const vertical = fmt.verticalHeaders;
          const headerCellClass = `matrix__headers-cell${vertical ? ' matrix__headers-cell--vertical' : ''}`;
          const headersRowClass = `matrix__headers-row${vertical ? ' matrix__headers-row--vertical' : ''}`;
          const colTextClass = `matrix__col-text${vertical ? ' matrix__col-text--vertical' : ''}`;
          const cornerClass = `matrix__sticky-col matrix__corner${vertical ? ' matrix__corner--vertical' : ''}`;
          const tableClass = `matrix${vertical ? ' matrix--vertical' : ''}`;
          const headingPrefix = sec.heading ? `${sec.heading} — ` : '';
          const totalsHeading = `${headingPrefix}sites totals`;
          const breakdownHeading = `${headingPrefix}per-system breakdown`;
          const categoryEndCols = new Set<string>();
          for (const seg of sec.segments) {
            if (seg.columns.length > 0) {
              categoryEndCols.add(seg.columns[seg.columns.length - 1]);
            }
          }
          return (
            <section key={sec.key} className="inspector__section">
              <h3>{totalsHeading}</h3>
              {sec.segments.length > 1 ? (
                sec.segments.map((seg) => (
                  <div key={seg.category} className="grants__group">
                    <h4 className="grants__group-label">{seg.category}</h4>
                    <ul className="grants">
                      {seg.columns.map((c) => (
                        <li key={c}>
                          <span className="grants__count">{(sec.totals.get(c) ?? 0).toLocaleString()}×</span> {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <ul className="grants">
                  {sec.columns.map((c) => (
                    <li key={c}>
                      <span className="grants__count">{(sec.totals.get(c) ?? 0).toLocaleString()}×</span> {c}
                    </li>
                  ))}
                </ul>
              )}
              <h3>{breakdownHeading}</h3>
              <div className="matrix__scroll">
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th className={cornerClass}>System</th>
                      <th className={headerCellClass} colSpan={sec.columns.length + 1}>
                        <div className="matrix__category-banners">
                          {sec.segments.map((seg) => (
                            <div
                              key={seg.category}
                              className="matrix__category-banner"
                              style={{ width: `${seg.columns.length * 30}px` }}
                            >
                              {seg.category}
                            </div>
                          ))}
                        </div>
                        <div className={headersRowClass}>
                          {sec.columns.map((c, i) => {
                            const endCls = categoryEndCols.has(c) ? ' matrix__header-slot--cat-end' : '';
                            const altCls = i % 2 === 1 ? ' matrix__col--alt' : '';
                            return (
                              <div key={c} className={`matrix__header-slot${endCls}${altCls}`}>
                                <span className={colTextClass}>{c}</span>
                              </div>
                            );
                          })}
                          <div className="matrix__header-slot matrix__header-slot--total">
                            <span className={`${colTextClass} matrix__col-text--total`}>Total</span>
                          </div>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sec.rows.map((r) => {
                      const rowTotal = Array.from(r.sites.values()).reduce((a, b) => a + b, 0);
                      return (
                        <tr key={r.id}>
                          <td className="matrix__sticky-col matrix__system-cell">
                            <button className="inspector__system" onClick={() => selectSystem(r.id)} type="button">
                              {renderSystemName(r.id, r.name)}
                            </button>
                            {badgesForUpgrades(r.upgradeNames).map((b) => (
                              <img
                                key={b.key}
                                src={b.icon}
                                alt={b.label}
                                title={b.description}
                                className="effect-badge__icon"
                              />
                            ))}
                            <div className="matrix__system-meta">
                              {r.constellationName}
                              <span className="matrix__region"> / {r.regionName}</span>
                            </div>
                          </td>
                          {sec.columns.map((c, i) => {
                            const n = r.sites.get(c) ?? 0;
                            const endCls = categoryEndCols.has(c) ? ' matrix__cell--cat-end' : '';
                            const altCls = i % 2 === 1 ? ' matrix__col--alt' : '';
                            return (
                              <td key={c} className={`matrix__cell${n > 0 ? ' matrix__cell--num' : ''}${endCls}${altCls}`}>
                                {n > 0 ? n : ''}
                              </td>
                            );
                          })}
                          <td className="matrix__cell matrix__cell--num matrix__col-total">{rowTotal}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
