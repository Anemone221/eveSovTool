import { useCallback, useEffect, useRef, useState } from 'react';
import { evesov } from '@/api/evesov';
import { useUi } from '@/state/uiStore';
import { OpsecPill } from '@/components/OpsecPill';
import { useOpsec } from '@/state/opsecStore';
import { useExportRegistry } from '@/state/exportRegistry';
import { buildExportFilename } from '@/data/exportFilename';
import { withOpsecCapture } from '@/data/opsecCapture';
import type { MapOverlayData, MapAuraData, TreeNodeRegion } from '@shared/index';
import {
  STRUCTURE_ICONS,
  STABILITY_ICONS,
  MINING_ICONS,
  combatSite,
  cynoBeacon,
  cynoJammer,
  jumpPortal,
  relicSite,
} from '@/data/mapIcons';
import { siteEffectsFor, aggregateGrants, formatGrants } from '@/data/effects';

const MAP_PREFS_KEY = 'map.selectedRegionId';
// Dotlan system node: <use x y> places top-left of the 56×28 symbol.
// Center confirmed by jump line coords: cx = use.x + 28.5, cy = use.y + 14.5
const NODE_CX = 28.5;
const NODE_CY = 14.5;
const NODE_H = 28;
// Padding added to the SVG viewBox on all sides so overlay icons (rendered outside
// the base node bounds) are never clipped by the viewport edge.
const SVG_MARGIN = 24;

export function RegionMap() {
  const activePlanId = useUi((s) => s.activePlanId);
  const selectedSystemId = useUi((s) => s.selectedSystemId);

  const [tree, setTree] = useState<TreeNodeRegion[]>([]);
  // Region IDs that have systems assigned in the active plan (empty = no plan / no systems).
  const [planRegionIds, setPlanRegionIds] = useState<Set<number>>(new Set());
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<MapOverlayData | null>(null);
  const [auraData, setAuraData] = useState<MapAuraData | null>(null);
  const [exporting, setExporting] = useState(false);

  // System SVG positions parsed from the dotlan <use> elements.
  const [positions, setPositions] = useState<Map<number, { x: number; y: number }>>(new Map());
  const positionsRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  const svgContainerRef = useRef<HTMLDivElement>(null);

  // Load tree once
  useEffect(() => {
    evesov.data.tree().then(setTree).catch(console.error);
  }, []);

  // Fetch plan matrix whenever the active plan changes to learn which regions it covers.
  useEffect(() => {
    if (activePlanId === null) {
      setPlanRegionIds(new Set());
      return;
    }
    evesov.plans.matrix(activePlanId).then((matrix) => {
      const ids = new Set(matrix.systems.map((s) => s.regionId));
      setPlanRegionIds(ids);
    }).catch(console.error);
  }, [activePlanId]);

  // Keep plan region IDs fresh when upgrades are added/removed.
  useEffect(() => {
    return evesov.events.on('plan-changed', () => {
      if (activePlanId === null) return;
      evesov.plans.matrix(activePlanId).then((matrix) => {
        const ids = new Set(matrix.systems.map((s) => s.regionId));
        setPlanRegionIds(ids);
      }).catch(console.error);
    });
  }, [activePlanId]);

  // Regions shown in the dropdown: plan regions when a plan is active, full tree otherwise.
  const planRegions = activePlanId && planRegionIds.size > 0
    ? tree.filter((r) => planRegionIds.has(r.id))
    : tree;

  // Auto-select first plan region when the plan changes, unless the current selection
  // is already in the plan.
  useEffect(() => {
    if (!activePlanId || planRegionIds.size === 0 || !tree.length) return;
    setSelectedRegionId((prev) => {
      if (prev !== null && planRegionIds.has(prev)) return prev;
      // Pick the first region in the plan (tree order = alphabetical from SDE).
      const first = tree.find((r) => planRegionIds.has(r.id));
      return first?.id ?? prev;
    });
  }, [activePlanId, planRegionIds, tree]);

  // Auto-select region when selected system changes.
  useEffect(() => {
    if (!selectedSystemId || !tree.length) return;
    for (const region of tree) {
      for (const constellation of region.constellations) {
        if (constellation.systems.some((s) => s.id === selectedSystemId)) {
          setSelectedRegionId(region.id);
          return;
        }
      }
    }
  }, [selectedSystemId, tree]);

  // Restore persisted region selection (only used as fallback before plan data loads).
  useEffect(() => {
    evesov.prefs.get(MAP_PREFS_KEY).then((v) => {
      if (v) {
        const n = Number(v);
        if (Number.isFinite(n)) setSelectedRegionId((prev) => prev ?? n);
      }
    }).catch(console.error);
  }, []);

  // Fetch SVG when region changes
  useEffect(() => {
    if (selectedRegionId === null) return;
    setSvgContent(null);
    setOverlay(null);
    setAuraData(null);
    setPositions(new Map());
    evesov.map.regionSvg(selectedRegionId).then(setSvgContent).catch(console.error);
  }, [selectedRegionId]);

  // Parse system positions after SVG is injected into the DOM
  useEffect(() => {
    if (!svgContent || !svgContainerRef.current) return;
    const frame = requestAnimationFrame(() => {
      const svgEl = svgContainerRef.current!.querySelector('svg');
      if (svgEl) {
        // Expand the viewBox by SVG_MARGIN on all sides so overlay icons rendered
        // outside the base node bounds are never clipped by the viewport edge.
        const vb = svgEl.getAttribute('viewBox');
        if (vb) {
          const [x, y, w, h] = vb.split(' ').map(Number);
          svgEl.setAttribute(
            'viewBox',
            `${x - SVG_MARGIN} ${y - SVG_MARGIN} ${w + SVG_MARGIN * 2} ${h + SVG_MARGIN * 2}`,
          );
        }
      }

      const map = new Map<number, { x: number; y: number }>();
      const uses = svgContainerRef.current!.querySelectorAll<SVGUseElement>('use[id^="sys"]');
      for (const el of uses) {
        const id = parseInt(el.id.replace('sys', ''), 10);
        if (!Number.isNaN(id)) {
          // Use SVG DOM API — handles both x/y attributes and transform-based positioning.
          const x = el.x?.baseVal?.value ?? NaN;
          const y = el.y?.baseVal?.value ?? NaN;
          if (!Number.isNaN(x) && !Number.isNaN(y)) {
            map.set(id, { x, y });
          }
        }
      }
      positionsRef.current = map;
      setPositions(map); // triggers overlay effect via positionsReady state
    });
    return () => cancelAnimationFrame(frame);
  }, [svgContent]);

  // Inject overlay <g> directly into the dotlan SVG so coordinates share the same space.
  // Depends on positions (state) so it re-runs once positions are parsed, and also when
  // overlay/auraData arrive. positionsRef gives the current map without stale-closure risk.
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container || !overlay || !auraData || positions.size === 0) return;

    const svgEl = container.querySelector('svg');
    if (!svgEl) return;

    // Remove any previous overlay groups
    svgEl.querySelector('#evesov-aura')?.remove();
    svgEl.querySelector('#evesov-lines')?.remove();
    svgEl.querySelector('#evesov-overlay')?.remove();

    const pos = positionsRef.current;
    const NS = 'http://www.w3.org/2000/svg';
    const XLINK = 'http://www.w3.org/1999/xlink';

    // Both aura and ALN lines are inserted before <g id="sysuse"> so they render behind nodes.
    const auraG = document.createElementNS(NS, 'g');
    auraG.id = 'evesov-aura';
    const linesG = document.createElementNS(NS, 'g');
    linesG.id = 'evesov-lines';
    const sysuse = svgEl.querySelector('#sysuse');
    if (sysuse?.parentNode) {
      sysuse.parentNode.insertBefore(auraG, sysuse);
      sysuse.parentNode.insertBefore(linesG, sysuse);
    } else {
      svgEl.appendChild(auraG);
      svgEl.appendChild(linesG);
    }

    for (const [idStr, count] of Object.entries(auraData.aura)) {
      const id = Number(idStr);
      const p = pos.get(id);
      if (!p) continue;
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(p.x - 4.6));
      rect.setAttribute('y', String(p.y - 2.3));
      rect.setAttribute('rx', '17');
      rect.setAttribute('ry', '16');
      rect.setAttribute('width', '67');
      rect.setAttribute('height', '34');
      rect.setAttribute('fill', 'url(#incBg)');
      rect.setAttribute('opacity', String(Math.min(count * 0.45, 1)));
      rect.setAttribute('pointer-events', 'none');
      auraG.appendChild(rect);
    }

    // Overlay group appended last so lines and icons render above system nodes.
    const g = document.createElementNS(NS, 'g');
    g.id = 'evesov-overlay';

    const ICON_SIZE = 16;
    const ICON_GAP = 2;

    // Helper: create a row of <image> elements centred on cx, with top of row at rowY.
    // tooltips[i], if provided, is attached as a <title> child for native SVG hover text.
    const addIconRow = (icons: string[], cx: number, rowY: number, tooltips?: string[]) => {
      const rowW = icons.length * ICON_SIZE + (icons.length - 1) * ICON_GAP;
      const startX = cx - rowW / 2;
      icons.forEach((src, i) => {
        const img = document.createElementNS(NS, 'image');
        img.setAttribute('x', String(startX + i * (ICON_SIZE + ICON_GAP)));
        img.setAttribute('y', String(rowY));
        img.setAttribute('width', String(ICON_SIZE));
        img.setAttribute('height', String(ICON_SIZE));
        img.setAttributeNS(XLINK, 'xlink:href', src);
        img.setAttribute('href', src);
        const tip = tooltips?.[i];
        if (tip) {
          const title = document.createElementNS(NS, 'title');
          title.textContent = tip;
          img.appendChild(title);
        }
        g.appendChild(img);
      });
    };

    // 2. ALN jump bridge lines
    for (const [a, b] of overlay.alnPairs) {
      const posA = pos.get(a);
      const posB = pos.get(b);
      if (!posA || !posB) continue;
      const x1 = posA.x + NODE_CX;
      const y1 = posA.y + NODE_CY;
      const x2 = posB.x + NODE_CX;
      const y2 = posB.y + NODE_CY;
      // Quadratic bezier: control point offset perpendicularly from the midpoint.
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const bulge = Math.min(len * 0.3, 40);
      const cx = mx - (dy / len) * bulge;
      const cy = my + (dx / len) * bulge;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
      path.setAttribute('stroke', '#58a6ff');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-dasharray', '6 3');
      path.setAttribute('fill', 'none');
      path.setAttribute('opacity', '0.85');
      linesG.appendChild(path);
    }

    // DB icon for a single upgrade name, falling back to the provided default.
    const dbIcon = (name: string, fallback: string): string =>
      overlay.upgradeIcons[name] ?? fallback;
    // DB icon for a list of upgrade names sharing a category — uses the first
    // name that has a DB icon, otherwise falls back to the provided default.
    const dbIconAny = (names: string[], fallback: string): string =>
      names.map((n) => overlay.upgradeIcons[n]).find(Boolean) ?? fallback;

    // 3. Per-system icons (above system nodes)
    for (const sys of overlay.systems) {
      const p = pos.get(sys.systemId);
      if (!p) continue;
      const cx = p.x + NODE_CX;

      const structureIcons = sys.structureTypes.map((t) => STRUCTURE_ICONS[t]).filter(Boolean);
      const structureTips = sys.structureTypes.filter((t) => STRUCTURE_ICONS[t]);

      const upgradeIcons: string[] = [];
      const upgradeTips: string[] = [];

      if (sys.miningTier !== null) {
        upgradeIcons.push(dbIconAny(sys.miningUpgrades, MINING_ICONS[sys.miningTier]));
        const grants = formatGrants(
          aggregateGrants(sys.miningUpgrades.map((u) => siteEffectsFor(u, sys.trueSec))),
        );
        const names = sys.miningUpgrades.join(', ');
        upgradeTips.push(grants ? `${names}\nSpawns: ${grants}` : names);
      }
      if (sys.hasCombatSites) {
        upgradeIcons.push(dbIconAny(sys.combatUpgrades, combatSite));
        const grants = formatGrants(
          aggregateGrants(sys.combatUpgrades.map((u) => siteEffectsFor(u, sys.trueSec))),
        );
        const names = sys.combatUpgrades.join(', ');
        upgradeTips.push(grants ? `${names}\nSpawns: ${grants}` : names);
      }
      if (sys.hasAnsiblex) {
        upgradeIcons.push(dbIcon('Advanced Logistics Network', jumpPortal));
        upgradeTips.push('Advanced Logistics Network\nEnables Ansiblex jump bridge');
      }
      if (sys.hasCynoBeacon) {
        upgradeIcons.push(dbIcon('Cynosural Navigation', cynoBeacon));
        upgradeTips.push('Cynosural Navigation\nEnables cynosural beacon');
      }
      if (sys.hasCynoJammer) {
        upgradeIcons.push(dbIcon('Cynosural Suppression', cynoJammer));
        upgradeTips.push('Cynosural Suppression\nBlocks cynos (except covert)');
      }
      if (sys.hasRelicSites) {
        upgradeIcons.push(dbIconAny(sys.relicUpgrades, relicSite));
        upgradeTips.push(`${sys.relicUpgrades.join(', ')}\nSpawns relic and data sites`);
      }
      if (sys.stabilityEffect && STABILITY_ICONS[sys.stabilityEffect]) {
        upgradeIcons.push(dbIcon(sys.stabilityEffect, STABILITY_ICONS[sys.stabilityEffect]));
        upgradeTips.push(sys.stabilityEffect);
      }

      // Structure icons above node: bottom of row sits just above the node top
      if (structureIcons.length > 0) {
        addIconRow(structureIcons, cx, p.y - ICON_SIZE - 2, structureTips);
      }
      // Upgrade icons below node: top of row sits just below the node bottom
      if (upgradeIcons.length > 0) {
        addIconRow(upgradeIcons, cx, p.y + NODE_H + 2, upgradeTips);
      }
    }

    svgEl.appendChild(g);

    return () => {
      svgEl.querySelector('#evesov-aura')?.remove();
      svgEl.querySelector('#evesov-lines')?.remove();
      svgEl.querySelector('#evesov-overlay')?.remove();
    };
  }, [overlay, auraData, positions]);

  // Fetch overlay + aura data when plan or region changes
  const fetchOverlayData = useCallback(() => {
    if (activePlanId === null || selectedRegionId === null) {
      setOverlay(null);
      setAuraData(null);
      return;
    }
    evesov.map.overlayData(activePlanId, selectedRegionId).then(setOverlay).catch(console.error);
    evesov.map.auraData(activePlanId, selectedRegionId).then(setAuraData).catch(console.error);
  }, [activePlanId, selectedRegionId]);

  useEffect(() => {
    fetchOverlayData();
  }, [fetchOverlayData]);

  // Re-fetch overlay on plan mutations
  useEffect(() => {
    return evesov.events.on('plan-changed', fetchOverlayData);
  }, [fetchOverlayData]);

  const handleRegionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    setSelectedRegionId(id);
    void evesov.prefs.set(MAP_PREFS_KEY, String(id));
  };

  const handleExportSvg = useCallback(async () => {
    if (!svgContainerRef.current || activePlanId === null) return;
    setExporting(true);
    try {
      const got = await evesov.plans.get(activePlanId);
      if (!got) return;
      const svgText = await withOpsecCapture(async () => {
        const svgEl = svgContainerRef.current!.querySelector('svg');
        if (!svgEl) return '';
        const vb = svgEl.getAttribute('viewBox');
        const [, , vbW, vbH] = vb ? vb.split(' ').map(Number) : [0, 0, 0, 0];
        const clone = svgEl.cloneNode(true) as SVGSVGElement;
        clone.setAttribute('width', String(vbW));
        clone.setAttribute('height', String(vbH));
        // Embed a dark background rect so the SVG looks the same when opened standalone.
        const NS = 'http://www.w3.org/2000/svg';
        const bg = document.createElementNS(NS, 'rect');
        const [vbX, vbY] = vb ? vb.split(' ').map(Number) : [0, 0];
        bg.setAttribute('x', String(vbX));
        bg.setAttribute('y', String(vbY));
        bg.setAttribute('width', String(vbW));
        bg.setAttribute('height', String(vbH));
        bg.setAttribute('fill', '#111111');
        clone.insertBefore(bg, clone.firstChild);
        return new XMLSerializer().serializeToString(clone);
      });
      if (!svgText) return;
      const regionName = planRegions.find((r) => r.id === selectedRegionId)?.name ?? 'region';
      const filename = buildExportFilename({
        planName: got.plan.name,
        panel: 'regionMap',
        systemName: regionName,
        ext: 'svg',
      });
      await evesov.exports.captureSvg(filename, svgText, {
        planId: activePlanId,
        planName: got.plan.name,
        panel: 'regionMap',
        systemName: regionName,
        opsecPreset: useOpsec.getState().preset
      });
    } finally {
      setExporting(false);
    }
  }, [activePlanId, planRegions, selectedRegionId]);

  const handleExport = useCallback(async () => {
    if (!svgContainerRef.current || activePlanId === null) return;
    setExporting(true);
    try {
      const got = await evesov.plans.get(activePlanId);
      if (!got) return;
      const dataUrl = await withOpsecCapture(async () => {
        const svgEl = svgContainerRef.current!.querySelector('svg');
        if (!svgEl) return '';
        const vb = svgEl.getAttribute('viewBox');
        const [, , vbW, vbH] = vb ? vb.split(' ').map(Number) : [0, 0, 0, 0];
        const SCALE = 2;
        const W = vbW * SCALE;
        const H = vbH * SCALE;
        // Clone so we can set explicit dimensions without affecting the live SVG.
        const clone = svgEl.cloneNode(true) as SVGSVGElement;
        clone.setAttribute('width', String(vbW));
        clone.setAttribute('height', String(vbH));
        const serialised = new XMLSerializer().serializeToString(clone);
        const url = 'data:image/svg+xml;base64,' + btoa(encodeURIComponent(serialised).replace(/%([0-9A-F]{2})/g, (_, p) => String.fromCharCode(parseInt(p, 16))));
        return new Promise<string>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#111111';
            ctx.fillRect(0, 0, W, H);
            ctx.drawImage(img, 0, 0, W, H);
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = (_e, _s, _l, _c, err) => {
            reject(err ?? new Error('SVG render failed'));
          };
          img.src = url;
        });
      });
      const regionName = planRegions.find((r) => r.id === selectedRegionId)?.name ?? 'region';
      const filename = buildExportFilename({
        planName: got.plan.name,
        panel: 'regionMap',
        systemName: regionName
      });
      await evesov.exports.capturePng(filename, dataUrl, {
        planId: activePlanId,
        planName: got.plan.name,
        panel: 'regionMap',
        systemName: regionName,
        opsecPreset: useOpsec.getState().preset
      });
    } finally {
      setExporting(false);
    }
  }, [activePlanId, planRegions, selectedRegionId]);

  useEffect(() => {
    useExportRegistry.getState().register('regionMap', handleExport);
    return () => useExportRegistry.getState().unregister('regionMap');
  }, [handleExport]);

  const regionName = planRegions.find((r) => r.id === selectedRegionId)?.name ?? '';

  return (
    <div className="region-map">
      <div className="region-map__controls">
        <select
          className="region-map__region-select"
          value={selectedRegionId ?? ''}
          onChange={handleRegionChange}
        >
          <option value="" disabled>Select region…</option>
          {planRegions.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <OpsecPill />
        <button
          type="button"
          className="region-map__export-btn"
          onClick={handleExport}
          disabled={exporting || !svgContent}
        >
          {exporting ? 'Exporting…' : 'Export PNG'}
        </button>
        <button
          type="button"
          className="region-map__export-btn"
          onClick={handleExportSvg}
          disabled={exporting || !svgContent}
        >
          {exporting ? 'Exporting…' : 'Export SVG'}
        </button>
      </div>

      {selectedRegionId === null ? (
        <div className="region-map__empty">Select a region to display its map.</div>
      ) : svgContent === null ? (
        <div className="region-map__empty">No map available for {regionName}.</div>
      ) : (
        <div className="region-map__container">
          {/* Base dotlan SVG — overlay is injected directly into this SVG via useEffect */}
          <div
            ref={svgContainerRef}
            className="region-map__svg"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        </div>
      )}
    </div>
  );
}
