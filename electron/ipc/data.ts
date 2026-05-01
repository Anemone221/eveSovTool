import { ipcMain } from 'electron';
import { getDb } from '../db/userDb.js';
import type {
  Constellation,
  Planet,
  Region,
  Star,
  SystemBudget,
  SystemDetail,
  SystemRow,
  TreeNodeConstellation,
  TreeNodeRegion,
  TreeNodeSystem,
  Upgrade
} from '@shared/index';

interface RegionDbRow {
  id: number;
  name: string;
  faction_id: number | null;
}

interface ConstellationDbRow {
  id: number;
  region_id: number;
  name: string;
  faction_id: number | null;
}

interface SystemDbRow {
  id: number;
  constellation_id: number;
  region_id: number;
  name: string;
  security_status: number | null;
  security_class: string | null;
}

interface StarDbRow {
  id: number;
  system_id: number;
  spectral_class: string | null;
  description: string | null;
  power: number;
}

interface PlanetDbRow {
  id: number;
  system_id: number;
  name: string;
  power: number;
  workforce: number;
  superionic_ice_per_hour: number;
  magmatic_gas_per_hour: number;
}

interface UpgradeDbRow {
  name: string;
  power: number;
  workforce: number;
  superionic_ice: number;
  magmatic_gas: number;
  startup: number;
}

interface BudgetDbRow {
  system_id: number;
  available_power: number;
  available_workforce: number;
  available_ice: number;
  available_gas: number;
  sov_eligible: number;
}

interface TreeSystemDbRow extends SystemDbRow {
  sov_eligible: number;
}

const toRegion = (r: RegionDbRow): Region => ({ id: r.id, name: r.name, factionId: r.faction_id });
const toConstellation = (c: ConstellationDbRow): Constellation => ({
  id: c.id,
  regionId: c.region_id,
  name: c.name,
  factionId: c.faction_id
});
const toSystem = (s: SystemDbRow): SystemRow => ({
  id: s.id,
  constellationId: s.constellation_id,
  regionId: s.region_id,
  name: s.name,
  securityStatus: s.security_status,
  securityClass: s.security_class
});
const toStar = (s: StarDbRow): Star => ({
  id: s.id,
  systemId: s.system_id,
  spectralClass: s.spectral_class,
  description: s.description,
  power: s.power
});
const toPlanet = (p: PlanetDbRow): Planet => ({
  id: p.id,
  systemId: p.system_id,
  name: p.name,
  power: p.power,
  workforce: p.workforce,
  superionicIcePerHour: p.superionic_ice_per_hour,
  magmaticGasPerHour: p.magmatic_gas_per_hour
});
const toUpgrade = (u: UpgradeDbRow): Upgrade => ({
  name: u.name,
  power: u.power,
  workforce: u.workforce,
  superionicIce: u.superionic_ice,
  magmaticGas: u.magmatic_gas,
  startup: u.startup
});
const toBudget = (b: BudgetDbRow): SystemBudget => ({
  systemId: b.system_id,
  availablePower: b.available_power,
  availableWorkforce: b.available_workforce,
  availableIce: b.available_ice,
  availableGas: b.available_gas,
  sovEligible: b.sov_eligible === 1
});

export function registerDataIpc(): void {
  ipcMain.handle('data.tree', () => {
    const db = getDb();
    const regions = db.prepare('SELECT id, name FROM regions ORDER BY name').all() as Pick<RegionDbRow, 'id' | 'name'>[];
    const constellations = db
      .prepare('SELECT id, region_id, name FROM constellations ORDER BY name')
      .all() as Pick<ConstellationDbRow, 'id' | 'region_id' | 'name'>[];
    const systems = db
      .prepare(
        `SELECT s.id, s.constellation_id, s.region_id, s.name, s.security_status, s.security_class,
                COALESCE(sb.sov_eligible, 0) AS sov_eligible
           FROM systems s
           LEFT JOIN system_budget sb ON sb.system_id = s.id
          ORDER BY s.name`
      )
      .all() as TreeSystemDbRow[];

    const constellationsByRegion = new Map<number, TreeNodeConstellation[]>();
    const systemsByConstellation = new Map<number, TreeNodeSystem[]>();

    for (const s of systems) {
      const node: TreeNodeSystem = {
        type: 'system',
        id: s.id,
        name: s.name,
        sovEligible: s.sov_eligible === 1,
        securityStatus: s.security_status
      };
      const arr = systemsByConstellation.get(s.constellation_id) ?? [];
      arr.push(node);
      systemsByConstellation.set(s.constellation_id, arr);
    }

    for (const c of constellations) {
      const node: TreeNodeConstellation = {
        type: 'constellation',
        id: c.id,
        name: c.name,
        systems: systemsByConstellation.get(c.id) ?? []
      };
      const arr = constellationsByRegion.get(c.region_id) ?? [];
      arr.push(node);
      constellationsByRegion.set(c.region_id, arr);
    }

    const tree: TreeNodeRegion[] = regions.map((r) => ({
      type: 'region',
      id: r.id,
      name: r.name,
      constellations: constellationsByRegion.get(r.id) ?? []
    }));
    return tree;
  });

  ipcMain.handle('data.region', (_, id: number): Region | null => {
    const row = getDb().prepare('SELECT * FROM regions WHERE id = ?').get(id) as RegionDbRow | undefined;
    return row ? toRegion(row) : null;
  });

  ipcMain.handle('data.constellation', (_, id: number): Constellation | null => {
    const row = getDb().prepare('SELECT * FROM constellations WHERE id = ?').get(id) as ConstellationDbRow | undefined;
    return row ? toConstellation(row) : null;
  });

  ipcMain.handle('data.system', (_, id: number): SystemDetail | null => {
    const db = getDb();
    const sysRow = db.prepare('SELECT * FROM systems WHERE id = ?').get(id) as SystemDbRow | undefined;
    if (!sysRow) return null;
    const region = db.prepare('SELECT * FROM regions WHERE id = ?').get(sysRow.region_id) as RegionDbRow;
    const constellation = db
      .prepare('SELECT * FROM constellations WHERE id = ?')
      .get(sysRow.constellation_id) as ConstellationDbRow;
    const star = db.prepare('SELECT * FROM stars WHERE system_id = ?').get(id) as StarDbRow | undefined;
    const planets = db
      .prepare('SELECT * FROM planets WHERE system_id = ? ORDER BY id')
      .all(id) as PlanetDbRow[];
    const budget = db
      .prepare('SELECT * FROM system_budget WHERE system_id = ?')
      .get(id) as BudgetDbRow;

    return {
      system: toSystem(sysRow),
      region: toRegion(region),
      constellation: toConstellation(constellation),
      star: star ? toStar(star) : null,
      planets: planets.map(toPlanet),
      budget: toBudget(budget)
    };
  });

  ipcMain.handle('data.upgrades', (): Upgrade[] => {
    const rows = getDb().prepare('SELECT * FROM upgrades ORDER BY name').all() as UpgradeDbRow[];
    return rows.map(toUpgrade);
  });

  ipcMain.handle('data.upgrade', (_, name: string): Upgrade | null => {
    const row = getDb().prepare('SELECT * FROM upgrades WHERE name = ?').get(name) as UpgradeDbRow | undefined;
    return row ? toUpgrade(row) : null;
  });
}
