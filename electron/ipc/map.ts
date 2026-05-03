import { ipcMain } from 'electron';
import { getDb } from '../db/userDb.js';
import { reachableSystems } from './adjacency.js';
import type { MapOverlayData, MapSystemOverlay, MapAuraData } from '@shared/index';

const PROSPECTING_RE = /Prospecting Array ([123])$/;
const THREAT_RE = /Threat Detection Array/;
const EXPLORATION_RE = /^Exploration Detector/;
const STABILITY_GENS = new Set([
  'Electric Stability Generator',
  'Exotic Stability Generator',
  'Gamma Stability Generator',
  'Plasma Stability Geneartor', // sic — matches the DB value
]);

export function registerMapIpc(): void {
  ipcMain.handle('map.regionSvg', (_, regionId: number): string | null => {
    const db = getDb();
    const row = db.prepare('SELECT map_svg FROM regions WHERE id = ?').get(regionId) as
      | { map_svg: string | null }
      | undefined;
    return row?.map_svg ?? null;
  });

  ipcMain.handle(
    'map.overlayData',
    (_, planId: number, regionId: number): MapOverlayData => {
      const db = getDb();

      // Upgrades per system in this region for this plan
      type UpgradeRow = { system_id: number; upgrade_name: string };
      const upgradeRows = db
        .prepare(
          `SELECT pu.system_id, pu.upgrade_name
           FROM plan_upgrades pu
           JOIN systems s ON s.id = pu.system_id
           WHERE pu.plan_id = ? AND s.region_id = ?`,
        )
        .all(planId, regionId) as UpgradeRow[];

      // Icons stored in the upgrades table for any upgrade name used in this region.
      type IconRow = { name: string; icon: Buffer | null };
      const uniqueNames = [...new Set(upgradeRows.map((r) => r.upgrade_name))];
      const upgradeIcons: Record<string, string> = {};
      if (uniqueNames.length > 0) {
        const placeholders = uniqueNames.map(() => '?').join(',');
        const iconRows = db
          .prepare(`SELECT name, icon FROM upgrades WHERE icon IS NOT NULL AND name IN (${placeholders})`)
          .all(...uniqueNames) as IconRow[];
        for (const { name, icon } of iconRows) {
          if (icon) upgradeIcons[name] = 'data:image/png;base64,' + icon.toString('base64');
        }
      }

      // Structures per system in this region for this plan
      type StructureRow = { system_id: number; structure_type: string };
      const structureRows = db
        .prepare(
          `SELECT ps.system_id, ps.structure_type
           FROM plan_structures ps
           JOIN systems s ON s.id = ps.system_id
           WHERE ps.plan_id = ? AND s.region_id = ?`,
        )
        .all(planId, regionId) as StructureRow[];

      // ALN links where either endpoint is in this region (bridges can cross region boundaries).
      type AlnRow = { system_id: number; linked_system_id: number | null };
      const alnRows = db
        .prepare(
          `SELECT al.system_id, al.linked_system_id
           FROM plan_aln_links al
           JOIN systems s  ON s.id  = al.system_id
           LEFT JOIN systems s2 ON s2.id = al.linked_system_id
           WHERE al.plan_id = ?
             AND al.linked_system_id IS NOT NULL
             AND (s.region_id = ? OR s2.region_id = ?)`,
        )
        .all(planId, regionId, regionId) as AlnRow[];

      // Security status per system in this region (for tooltip site calculations)
      type SecRow = { id: number; security_status: number | null };
      const secRows = db
        .prepare('SELECT id, security_status FROM systems WHERE region_id = ?')
        .all(regionId) as SecRow[];
      const secMap = new Map<number, number | null>(secRows.map((r) => [r.id, r.security_status]));

      // Build per-system overlay map
      const overlayMap = new Map<number, MapSystemOverlay>();

      const getOrCreate = (systemId: number): MapSystemOverlay => {
        if (!overlayMap.has(systemId)) {
          overlayMap.set(systemId, {
            systemId,
            trueSec: secMap.get(systemId) !== undefined ? secMap.get(systemId)! : null,
            structureTypes: [],
            stabilityEffect: null,
            miningTier: null,
            miningUpgrades: [],
            hasCombatSites: false,
            combatUpgrades: [],
            hasAnsiblex: false,
            hasCynoBeacon: false,
            hasCynoJammer: false,
            hasRelicSites: false,
            relicUpgrades: [],
          });
        }
        return overlayMap.get(systemId)!;
      };

      // ALN-linked system IDs (systems that have a configured jump bridge target)
      const alnLinked = new Set(alnRows.map((r) => r.system_id));

      for (const row of upgradeRows) {
        const overlay = getOrCreate(row.system_id);
        const name = row.upgrade_name;

        const prospectMatch = name.match(PROSPECTING_RE);
        if (prospectMatch) {
          const tier = parseInt(prospectMatch[1], 10) as 1 | 2 | 3;
          if (overlay.miningTier === null || tier > overlay.miningTier) {
            overlay.miningTier = tier;
          }
          if (!overlay.miningUpgrades.includes(name)) overlay.miningUpgrades.push(name);
          continue;
        }

        if (THREAT_RE.test(name)) {
          overlay.hasCombatSites = true;
          if (!overlay.combatUpgrades.includes(name)) overlay.combatUpgrades.push(name);
          continue;
        }

        if (EXPLORATION_RE.test(name)) {
          overlay.hasRelicSites = true;
          if (!overlay.relicUpgrades.includes(name)) overlay.relicUpgrades.push(name);
          continue;
        }

        if (STABILITY_GENS.has(name)) {
          overlay.stabilityEffect = name;
          continue;
        }

        if (name === 'Advanced Logistics Network' && alnLinked.has(row.system_id)) {
          overlay.hasAnsiblex = true;
          continue;
        }

        if (name === 'Cynosural Navigation') {
          overlay.hasCynoBeacon = true;
          continue;
        }

        if (name === 'Cynosural Suppression') {
          overlay.hasCynoJammer = true;
          continue;
        }
      }

      for (const row of structureRows) {
        const overlay = getOrCreate(row.system_id);
        if (!overlay.structureTypes.includes(row.structure_type)) {
          overlay.structureTypes.push(row.structure_type);
        }
      }

      // Deduplicate ALN pairs as [min, max]
      const pairSet = new Set<string>();
      const alnPairs: [number, number][] = [];
      for (const row of alnRows) {
        if (row.linked_system_id === null) continue;
        const a = Math.min(row.system_id, row.linked_system_id);
        const b = Math.max(row.system_id, row.linked_system_id);
        const key = `${a}-${b}`;
        if (!pairSet.has(key)) {
          pairSet.add(key);
          alnPairs.push([a, b]);
        }
      }

      return {
        systems: Array.from(overlayMap.values()),
        alnPairs,
        upgradeIcons,
      };
    },
  );

  ipcMain.handle(
    'map.auraData',
    (_, planId: number, regionId: number): MapAuraData => {
      const db = getDb();

      type SysRow = { system_id: number };
      const explorationSystems = db
        .prepare(
          `SELECT DISTINCT pu.system_id
           FROM plan_upgrades pu
           JOIN systems s ON s.id = pu.system_id
           WHERE pu.plan_id = ? AND s.region_id = ?
             AND pu.upgrade_name LIKE 'Exploration Detector%'`,
        )
        .all(planId, regionId) as SysRow[];

      const aura: Record<number, number> = {};

      for (const { system_id } of explorationSystems) {
        // Include the source system itself
        aura[system_id] = (aura[system_id] ?? 0) + 1;
        // All systems within 5 stargate hops
        const reachable = reachableSystems(db, system_id, 5);
        for (const id of reachable) {
          aura[id] = (aura[id] ?? 0) + 1;
        }
      }

      return { aura };
    },
  );
}
