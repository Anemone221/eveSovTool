import { useCallback, useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { evesov } from '@/api/evesov';
import { useUi } from '@/state/uiStore';
import { OpsecPill } from '@/components/OpsecPill';
import { useOpsec } from '@/state/opsecStore';
import { useExportRegistry } from '@/state/exportRegistry';
import { buildExportFilename } from '@/data/exportFilename';
import { withOpsecCapture } from '@/data/opsecCapture';
import type { MapOverlayData, MapAuraData, TreeNodeRegion } from '@shared/index';
import {
    MINING_ICONS,
    STABILITY_ICONS,
    STRUCTURE_ICONS,
    combatSite,
    cynoBeacon,
    cynoJammer,
    jumpPortal,
    relicSite,
} from "@/data/mapIcons";
import { useUi } from "@/state/uiStore";
import type {
    MapAuraData,
    MapOverlayData,
    TreeNodeRegion,
} from "@shared/index";
import html2canvas from "html2canvas";
import { useCallback, useEffect, useRef, useState } from "react";

const MAP_PREFS_KEY = "map.selectedRegionId";
// Dotlan system node: <use x y> places top-left of the 56×28 symbol.
// Center confirmed by jump line coords: cx = use.x + 28.5, cy = use.y + 14.5
const NODE_CX = 28.5;
const NODE_CY = 14.5;
const NODE_H = 28;

export function RegionMap() {
    const activePlanId = useUi((s) => s.activePlanId);
    const selectedSystemId = useUi((s) => s.selectedSystemId);

    const [tree, setTree] = useState<TreeNodeRegion[]>([]);
    // Region IDs that have systems assigned in the active plan (empty = no plan / no systems).
    const [planRegionIds, setPlanRegionIds] = useState<Set<number>>(new Set());
    const [selectedRegionId, setSelectedRegionId] = useState<number | null>(
        null,
    );
    const [svgContent, setSvgContent] = useState<string | null>(null);
    const [overlay, setOverlay] = useState<MapOverlayData | null>(null);
    const [auraData, setAuraData] = useState<MapAuraData | null>(null);
    const [exporting, setExporting] = useState(false);

    // System SVG positions parsed from the dotlan <use> elements.
    const [positions, setPositions] = useState<
        Map<number, { x: number; y: number }>
    >(new Map());
    const positionsRef = useRef<Map<number, { x: number; y: number }>>(
        new Map(),
    );

    const svgContainerRef = useRef<HTMLDivElement>(null);
    const mapWrapperRef = useRef<HTMLDivElement>(null);

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
        evesov.plans
            .matrix(activePlanId)
            .then((matrix) => {
                const ids = new Set(matrix.systems.map((s) => s.regionId));
                setPlanRegionIds(ids);
            })
            .catch(console.error);
    }, [activePlanId]);

    // Keep plan region IDs fresh when upgrades are added/removed.
    useEffect(() => {
        return evesov.events.on("plan-changed", () => {
            if (activePlanId === null) return;
            evesov.plans
                .matrix(activePlanId)
                .then((matrix) => {
                    const ids = new Set(matrix.systems.map((s) => s.regionId));
                    setPlanRegionIds(ids);
                })
                .catch(console.error);
        });
    }, [activePlanId]);

    // Regions shown in the dropdown: plan regions when a plan is active, full tree otherwise.
    const planRegions =
        activePlanId && planRegionIds.size > 0
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
                if (
                    constellation.systems.some((s) => s.id === selectedSystemId)
                ) {
                    setSelectedRegionId(region.id);
                    return;
                }
            }
        }
    }, [selectedSystemId, tree]);

    // Restore persisted region selection (only used as fallback before plan data loads).
    useEffect(() => {
        evesov.prefs
            .get(MAP_PREFS_KEY)
            .then((v) => {
                if (v) {
                    const n = Number(v);
                    if (Number.isFinite(n))
                        setSelectedRegionId((prev) => prev ?? n);
                }
            })
            .catch(console.error);
    }, []);

    // Fetch SVG when region changes
    useEffect(() => {
        if (selectedRegionId === null) return;
        setSvgContent(null);
        setOverlay(null);
        setAuraData(null);
        setPositions(new Map());
        evesov.map
            .regionSvg(selectedRegionId)
            .then(setSvgContent)
            .catch(console.error);
    }, [selectedRegionId]);

    // Parse system positions after SVG is injected into the DOM
    useEffect(() => {
        if (!svgContent || !svgContainerRef.current) return;
        const frame = requestAnimationFrame(() => {
            // Allow the overlay group to extend outside the SVG's viewBox without clipping.
            const svgEl = svgContainerRef.current!.querySelector("svg");
            if (svgEl) {
                svgEl.setAttribute("overflow", "visible");
                const vb = svgEl.viewBox.baseVal;
                // Expand the viewBox to guarantee icon rows are never clipped.
                // Icons above node: 16px icon + 2px gap = 18px. Below: NODE_H(28) + 2 + 16 = 46px.
                // Add 5px aesthetic border on top of each overhang.
                const PAD_TOP = 23;   // 18 icon + 5 border
                const PAD_BOTTOM = 51; // 46 icon + 5 border
                const PAD_SIDE = 37;   // half max icon row (32px) + 5 border
                svgEl.setAttribute("viewBox", `${vb.x - PAD_SIDE} ${vb.y - PAD_TOP} ${vb.width + PAD_SIDE * 2} ${vb.height + PAD_TOP + PAD_BOTTOM}`);
            }

            const map = new Map<number, { x: number; y: number }>();
            const uses =
                svgContainerRef.current!.querySelectorAll<SVGUseElement>(
                    'use[id^="sys"]',
                );
            for (const el of uses) {
                const id = parseInt(el.id.replace("sys", ""), 10);
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

        const svgEl = container.querySelector("svg");
        if (!svgEl) return;

        // Remove any previous overlay groups
        svgEl.querySelector("#evesov-aura")?.remove();
        svgEl.querySelector("#evesov-overlay")?.remove();

        const pos = positionsRef.current;
        const NS = "http://www.w3.org/2000/svg";
        const XLINK = "http://www.w3.org/1999/xlink";

        // Aura group inserted before <g id="sysuse"> so it renders behind system nodes.
        const auraG = document.createElementNS(NS, "g");
        auraG.id = "evesov-aura";
        const sysuse = svgEl.querySelector("#sysuse");
        if (sysuse?.parentNode) sysuse.parentNode.insertBefore(auraG, sysuse);
        else svgEl.appendChild(auraG);

        for (const [idStr, count] of Object.entries(auraData.aura)) {
            const id = Number(idStr);
            const p = pos.get(id);
            if (!p) continue;
            const rect = document.createElementNS(NS, "rect");
            rect.setAttribute("x", String(p.x - 4.6));
            rect.setAttribute("y", String(p.y - 2.3));
            rect.setAttribute("rx", "17");
            rect.setAttribute("ry", "16");
            rect.setAttribute("width", "67");
            rect.setAttribute("height", "34");
            rect.setAttribute("fill", "url(#incBg)");
            rect.setAttribute("opacity", String(Math.min(count * 0.45, 1)));
            rect.setAttribute("pointer-events", "none");
            auraG.appendChild(rect);
        }

        // Overlay group appended last so lines and icons render above system nodes.
        const g = document.createElementNS(NS, "g");
        g.id = "evesov-overlay";

        const ICON_SIZE = 16;
        const ICON_GAP = 2;

        // Helper: create a row of <image> elements centred on cx, with top of row at rowY
        const addIconRow = (icons: string[], cx: number, rowY: number) => {
            const rowW =
                icons.length * ICON_SIZE + (icons.length - 1) * ICON_GAP;
            const startX = cx - rowW / 2;
            icons.forEach((src, i) => {
                const img = document.createElementNS(NS, "image");
                img.setAttribute(
                    "x",
                    String(startX + i * (ICON_SIZE + ICON_GAP)),
                );
                img.setAttribute("y", String(rowY));
                img.setAttribute("width", String(ICON_SIZE));
                img.setAttribute("height", String(ICON_SIZE));
                img.setAttributeNS(XLINK, "xlink:href", src);
                img.setAttribute("href", src);
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
            const path = document.createElementNS(NS, "path");
            path.setAttribute("d", `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
            path.setAttribute("stroke", "#58a6ff");
            path.setAttribute("stroke-width", "2");
            path.setAttribute("stroke-dasharray", "6 3");
            path.setAttribute("fill", "none");
            path.setAttribute("opacity", "0.85");
            g.appendChild(path);
        }

        // 3. Per-system icons (above system nodes)
        for (const sys of overlay.systems) {
            const p = pos.get(sys.systemId);
            if (!p) continue;
            const cx = p.x + NODE_CX;

            const structureIcons = sys.structureTypes
                .map((t) => STRUCTURE_ICONS[t])
                .filter(Boolean);
            const upgradeIcons: string[] = [];
            if (sys.miningTier !== null)
                upgradeIcons.push(MINING_ICONS[sys.miningTier]);
            if (sys.hasCombatSites) upgradeIcons.push(combatSite);
            if (sys.hasAnsiblex) upgradeIcons.push(jumpPortal);
            if (sys.hasCynoBeacon) upgradeIcons.push(cynoBeacon);
            if (sys.hasCynoJammer) upgradeIcons.push(cynoJammer);
            if (sys.hasRelicSites) upgradeIcons.push(relicSite);
            if (sys.stabilityEffect && STABILITY_ICONS[sys.stabilityEffect]) {
                upgradeIcons.push(STABILITY_ICONS[sys.stabilityEffect]);
            }

            // Structure icons above node: bottom of row sits just above the node top
            if (structureIcons.length > 0) {
                addIconRow(structureIcons, cx, p.y - ICON_SIZE - 2);
            }
            // Upgrade icons below node: top of row sits just below the node bottom
            if (upgradeIcons.length > 0) {
                addIconRow(upgradeIcons, cx, p.y + NODE_H + 2);
            }
        }

        svgEl.appendChild(g);

        return () => {
            svgEl.querySelector("#evesov-aura")?.remove();
            svgEl.querySelector("#evesov-overlay")?.remove();
        };
    }, [overlay, auraData, positions]);

    // Fetch overlay + aura data when plan or region changes
    const fetchOverlayData = useCallback(() => {
        if (activePlanId === null || selectedRegionId === null) {
            setOverlay(null);
            setAuraData(null);
            return;
        }
        evesov.map
            .overlayData(activePlanId, selectedRegionId)
            .then(setOverlay)
            .catch(console.error);
        evesov.map
            .auraData(activePlanId, selectedRegionId)
            .then(setAuraData)
            .catch(console.error);
    }, [activePlanId, selectedRegionId]);

    useEffect(() => {
        fetchOverlayData();
    }, [fetchOverlayData]);

    // Re-fetch overlay on plan mutations
    useEffect(() => {
        return evesov.events.on("plan-changed", fetchOverlayData);
    }, [fetchOverlayData]);

    const handleRegionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = Number(e.target.value);
        setSelectedRegionId(id);
        void evesov.prefs.set(MAP_PREFS_KEY, String(id));
    };

    const handleExport = async () => {
        if (!mapWrapperRef.current || !svgContainerRef.current) return;
        setExporting(true);
        try {
            const svgEl = svgContainerRef.current.querySelector("svg");
            const full = await html2canvas(mapWrapperRef.current, {
                backgroundColor: "#111111",
                scale: 2,
                useCORS: true,
            });

            // The SVG viewBox was expanded to include icon overhangs + border.
            // Capture that full expanded viewBox as the export — no additional crop.
            // Scale factor maps expanded viewBox coords → rendered canvas pixels.
            const vb = svgEl?.viewBox.baseVal;
            const vbX = vb?.x ?? 0;
            const vbY = vb?.y ?? 0;
            const vbW = vb?.width ?? 1024;
            const vbH = vb?.height ?? 768;
            const renderedW = full.width; // already scaled ×2
            const renderedH = full.height;
            const scaleX = renderedW / vbW;
            const scaleY = renderedH / vbH;

            // Crop to just the system content bounding box within the viewBox,
            // keeping the icon/border padding already baked into the viewBox.
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const pos = positionsRef.current;
            for (const { x, y } of pos.values()) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x + 58 > maxX) maxX = x + 58;
                if (y + 28 > maxY) maxY = y + 28;
            }

            // Expand bounding box to match the icon+border padding already in the viewBox.
            const PAD_TOP = 23;
            const PAD_BOTTOM = 51;
            const PAD_SIDE = 37;
            minX = Math.max(vbX, minX - PAD_SIDE);
            minY = Math.max(vbY, minY - PAD_TOP);
            maxX = Math.min(vbX + vbW, maxX + PAD_SIDE);
            maxY = Math.min(vbY + vbH, maxY + PAD_BOTTOM);

            // Convert from viewBox coords to canvas pixels (viewBox origin may be negative).
            const cropX = Math.floor((minX - vbX) * scaleX);
            const cropY = Math.floor((minY - vbY) * scaleY);
            const cropW = Math.ceil((maxX - minX) * scaleX);
            const cropH = Math.ceil((maxY - minY) * scaleY);

            const cropped = document.createElement("canvas");
            cropped.width = cropW;
            cropped.height = cropH;
            const ctx = cropped.getContext("2d")!;
            ctx.drawImage(full, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

            const dataUrl = cropped.toDataURL("image/png");
            const regionName =
                planRegions.find((r) => r.id === selectedRegionId)?.name ??
                "region";
            await evesov.exports.capturePng(
                `region-map-${regionName}.png`,
                dataUrl,
            );
        } finally {
            setExporting(false);
        }
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

  const handleExport = useCallback(async () => {
    if (!mapWrapperRef.current || activePlanId === null) return;
    setExporting(true);
    try {
      const got = await evesov.plans.get(activePlanId);
      if (!got) return;
      const dataUrl = await withOpsecCapture(async () => {
        const canvas = await html2canvas(mapWrapperRef.current!, {
          backgroundColor: '#111111',
          scale: 2,
          useCORS: true,
        });
        return canvas.toDataURL('image/png');
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
      </div>

      {selectedRegionId === null ? (
        <div className="region-map__empty">Select a region to display its map.</div>
      ) : svgContent === null ? (
        <div className="region-map__empty">No map available for {regionName}.</div>
      ) : (
        <div className="region-map__container" ref={mapWrapperRef}>
          {/* Base dotlan SVG — overlay is injected directly into this SVG via useEffect */}
          <div
            ref={svgContainerRef}
            className="region-map__svg"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        </div>
    );
}
