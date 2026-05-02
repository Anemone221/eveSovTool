import html2canvas from 'html2canvas';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evesov } from '@/api/evesov';
import { useUi } from '@/state/uiStore';
import { siteEffectsFor } from '@/data/effects';
import { badgesForUpgrades } from '@/data/systemEffects';
import type { PlanMatrix } from '@shared/index';

interface SystemRow {
  id: number;
  name: string;
  constellationName: string;
  regionName: string;
  sites: Map<string, number>;
  upgradeNames: string[];
}

export function SitesOverview() {
  const activePlanId = useUi((s) => s.activePlanId);
  const selectSystem = useUi((s) => s.selectSystem);
  const [matrix, setMatrix] = useState<PlanMatrix | null>(null);
  const matrixRef = useRef<HTMLDivElement>(null);

  const onExportPng = useCallback(async () => {
    const el = matrixRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, {
      backgroundColor: '#1a1a1a',
      width: el.scrollWidth,
      height: el.scrollHeight,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
      scrollX: 0,
      scrollY: 0
    });
    const dataUrl = canvas.toDataURL('image/png');
    const filename = `sites-${activePlanId ?? 'plan'}-${Date.now()}.png`;
    await evesov.exports.capturePng(filename, dataUrl);
  }, [activePlanId]);

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

  const { rows, columns, totals, grandTotal } = useMemo(() => {
    const empty = {
      rows: [] as SystemRow[],
      columns: [] as string[],
      totals: new Map<string, number>(),
      grandTotal: 0
    };
    if (!matrix) return empty;
    const colSet = new Set<string>();
    const colTotals = new Map<string, number>();
    let grand = 0;
    const built: SystemRow[] = matrix.systems
      .map((s) => {
        const sites = new Map<string, number>();
        for (const upg of s.upgrades) {
          for (const g of siteEffectsFor(upg.name, s.securityStatus)) {
            sites.set(g.site, (sites.get(g.site) ?? 0) + g.count);
            colSet.add(g.site);
          }
        }
        return {
          id: s.id,
          name: s.name,
          constellationName: s.constellationName,
          regionName: s.regionName,
          sites,
          upgradeNames: s.upgrades.map((u) => u.name)
        };
      })
      .filter((r) => r.sites.size > 0);
    for (const r of built) {
      for (const [site, count] of r.sites) {
        colTotals.set(site, (colTotals.get(site) ?? 0) + count);
        grand += count;
      }
    }
    const cols = Array.from(colSet).sort();
    return { rows: built, columns: cols, totals: colTotals, grandTotal: grand };
  }, [matrix]);

  if (activePlanId === null) {
    return <div className="overview overview--empty">Activate a plan to see sites overview.</div>;
  }
  if (!matrix) return <div className="overview overview--empty">Loading…</div>;
  if (rows.length === 0) {
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
          {rows.length} systems · {columns.length} site types · {grandTotal.toLocaleString()} total sites
        </span>
      </header>
      <div className="format-bar__actions">
        <button type="button" className="matrix__export-btn" onClick={onExportPng}>Export PNG</button>
      </div>

      <div ref={matrixRef}>
      <section className="inspector__section">
        <h3>Sites totals across plan</h3>
        <ul className="grants">
          {columns.map((c) => (
            <li key={c}>
              <span className="grants__count">{(totals.get(c) ?? 0).toLocaleString()}×</span> {c}
            </li>
          ))}
        </ul>
      </section>

      <section className="inspector__section">
        <h3>Per-system breakdown</h3>
        <div className="matrix__scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th className="matrix__sticky-col matrix__corner">System</th>
                <th className="matrix__headers-cell" colSpan={columns.length + 1}>
                  <div className="matrix__headers-row">
                    {columns.map((c) => (
                      <div key={c} className="matrix__header-slot">
                        <span className="matrix__col-text">{c}</span>
                      </div>
                    ))}
                    <div className="matrix__header-slot matrix__header-slot--total">
                      <span className="matrix__col-text matrix__col-text--total">Total</span>
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rowTotal = Array.from(r.sites.values()).reduce((a, b) => a + b, 0);
                return (
                  <tr key={r.id}>
                    <td className="matrix__sticky-col matrix__system-cell">
                      <button className="inspector__system" onClick={() => selectSystem(r.id)} type="button">
                        {r.name}
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
                    {columns.map((c) => {
                      const n = r.sites.get(c) ?? 0;
                      return (
                        <td key={c} className={`matrix__cell${n > 0 ? ' matrix__cell--num' : ''}`}>
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
      </div>
    </div>
  );
}
