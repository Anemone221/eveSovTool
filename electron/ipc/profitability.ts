import type Database from 'better-sqlite3';
import {
  DRILL_RATE_M3_PER_HOUR,
  EFFICIENCY,
  FORGE_REGION_ID,
  FUEL_BLOCK_TYPE_ID,
  FUEL_PER_HOUR,
  GOO_TYPE_IDS,
  MAGMATIC_GAS_TYPE_ID,
  MOON_ORE_YIELDS,
  type GooKey,
} from './marketTypes.js';

export type PriceField =
  | 'average'
  | 'lowest'
  | 'highest'
  | 'median30'
  | 'p5_30'
  | 'vwap30';

export const DEFAULT_PRICE_FIELD: PriceField = 'average';

export function isPriceField(v: unknown): v is PriceField {
  return (
    v === 'average' ||
    v === 'lowest' ||
    v === 'highest' ||
    v === 'median30' ||
    v === 'p5_30' ||
    v === 'vwap30'
  );
}

interface MarketRow {
  date: string;
  average: number;
  highest: number;
  lowest: number;
  volume: number;
}

export interface PriceLookup {
  price: number;
  asOf: string;
  field: PriceField;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function lookupPrice(
  db: Database.Database,
  typeId: number,
  field: PriceField,
): PriceLookup | null {
  const rows = db
    .prepare(
      `SELECT date, average, highest, lowest, volume
         FROM market_history
        WHERE type_id = ? AND region_id = ?
        ORDER BY date DESC
        LIMIT 30`,
    )
    .all(typeId, FORGE_REGION_ID) as MarketRow[];
  if (rows.length === 0) return null;

  const latest = rows[0];
  switch (field) {
    case 'average':
      return { price: latest.average, asOf: latest.date, field };
    case 'lowest':
      return { price: latest.lowest, asOf: latest.date, field };
    case 'highest':
      return { price: latest.highest, asOf: latest.date, field };
    case 'median30': {
      const sorted = rows.map((r) => r.average).sort((a, b) => a - b);
      return {
        price: quantile(sorted, 0.5),
        asOf: `${rows[rows.length - 1].date}…${latest.date}`,
        field,
      };
    }
    case 'p5_30': {
      const sorted = rows.map((r) => r.average).sort((a, b) => a - b);
      return {
        price: quantile(sorted, 0.05),
        asOf: `${rows[rows.length - 1].date}…${latest.date}`,
        field,
      };
    }
    case 'vwap30': {
      let num = 0;
      let den = 0;
      for (const r of rows) {
        num += r.average * r.volume;
        den += r.volume;
      }
      if (den === 0) {
        return { price: latest.average, asOf: latest.date, field };
      }
      return {
        price: num / den,
        asOf: `${rows[rows.length - 1].date}…${latest.date}`,
        field,
      };
    }
  }
}

export function getCurrentPriceField(db: Database.Database): PriceField {
  const row = db
    .prepare('SELECT value FROM preferences WHERE key = ?')
    .get('settings.marketSync.priceField') as { value: string } | undefined;
  return row && isPriceField(row.value) ? row.value : DEFAULT_PRICE_FIELD;
}

export type DrillStructureType = 'Metenox' | 'Athanor' | 'Tatara';

export function isDrillStructure(t: string): t is DrillStructureType {
  return t === 'Metenox' || t === 'Athanor' || t === 'Tatara';
}

export interface ProfitabilityResult {
  structureId: number | null;
  structureType: DrillStructureType;
  revenuePerHour: number;
  fuelCostPerHour: number;
  profitPerHour: number;
  priceField: PriceField;
  asOf: string;
  missingPrices: string[];
}

interface StructureRow {
  id: number;
  system_id: number;
  structure_type: string;
  moon_id: number | null;
}

interface MoonScanRow {
  ore_type: string;
  ore_percent: number;
  moon_number: number;
}

interface MoonScanRowById {
  ore_type: string;
  ore_percent: number;
}

function findOreYields(oreType: string): Partial<Record<GooKey, number>> | null {
  const lower = oreType.toLowerCase();
  for (const [name, yields] of Object.entries(MOON_ORE_YIELDS)) {
    if (lower.includes(name.toLowerCase())) return yields;
  }
  return null;
}

export function computeProfitabilityForMoonId(
  db: Database.Database,
  moonId: number,
  structureType: DrillStructureType,
  structureId: number | null = null,
): ProfitabilityResult | null {
  const scans = db
    .prepare(
      `SELECT ore_type, ore_percent
         FROM moon_scans
        WHERE moon_id = ?`,
    )
    .all(moonId) as MoonScanRowById[];
  return computeFromScans(db, scans, structureType, structureId);
}

export function computeProfitabilityForMoon(
  db: Database.Database,
  systemId: number,
  moonNumber: number,
  structureType: DrillStructureType,
  structureId: number | null = null,
): ProfitabilityResult | null {
  const scans = db
    .prepare(
      `SELECT ore_type, ore_percent, moon_number
         FROM moon_scans
        WHERE system_id = ? AND moon_number = ?`,
    )
    .all(systemId, moonNumber) as MoonScanRow[];
  return computeFromScans(db, scans, structureType, structureId);
}

function computeFromScans(
  db: Database.Database,
  scans: MoonScanRowById[],
  structureType: DrillStructureType,
  structureId: number | null,
): ProfitabilityResult | null {
  if (scans.length === 0) return null;

  const field = getCurrentPriceField(db);
  const efficiency = EFFICIENCY[structureType];
  const fuelBurn = FUEL_PER_HOUR[structureType];

  // Per hour: 30,000 m3 of moon rock distributed by ore_percent.
  // Yield table is per 100 units = 1000 m3. Normalising: per ore,
  //   gooUnits = (rock_m3 / 1000) * yield_per_100u * efficiency
  let revenue = 0;
  const missingPrices = new Set<string>();
  let asOf = '';

  for (const scan of scans) {
    const yields = findOreYields(scan.ore_type);
    if (!yields) continue;
    const oreM3 = DRILL_RATE_M3_PER_HOUR * scan.ore_percent;
    const batchUnits = oreM3 / 1000; // = number of "100-unit batches"
    for (const [gooKey, qtyPer100] of Object.entries(yields)) {
      if (!qtyPer100) continue;
      const typeId = GOO_TYPE_IDS[gooKey as GooKey];
      const lookup = lookupPrice(db, typeId, field);
      if (!lookup) {
        missingPrices.add(gooKey);
        continue;
      }
      const gooUnits = batchUnits * qtyPer100 * efficiency;
      revenue += gooUnits * lookup.price;
      asOf = lookup.asOf;
    }
  }

  let fuelCost = 0;
  if (fuelBurn.fuelBlocks > 0) {
    const lookup = lookupPrice(db, FUEL_BLOCK_TYPE_ID, field);
    if (!lookup) missingPrices.add('FuelBlock');
    else fuelCost += fuelBurn.fuelBlocks * lookup.price;
  }
  if (fuelBurn.magmaticGas > 0) {
    const lookup = lookupPrice(db, MAGMATIC_GAS_TYPE_ID, field);
    if (!lookup) missingPrices.add('MagmaticGas');
    else fuelCost += fuelBurn.magmaticGas * lookup.price;
  }

  return {
    structureId,
    structureType,
    revenuePerHour: revenue,
    fuelCostPerHour: fuelCost,
    profitPerHour: revenue - fuelCost,
    priceField: field,
    asOf,
    missingPrices: Array.from(missingPrices),
  };
}

export function computeProfitability(
  db: Database.Database,
  structureId: number,
): ProfitabilityResult | null {
  const structure = db
    .prepare(
      `SELECT id, system_id, structure_type, moon_id
         FROM plan_structures WHERE id = ?`,
    )
    .get(structureId) as StructureRow | undefined;
  if (!structure) return null;
  if (!isDrillStructure(structure.structure_type)) return null;
  if (structure.moon_id == null) return null;
  return computeProfitabilityForMoon(
    db,
    structure.system_id,
    structure.moon_id,
    structure.structure_type,
    structure.id,
  );
}

export function hasMarketData(db: Database.Database): boolean {
  const row = db
    .prepare('SELECT 1 AS ok FROM market_history LIMIT 1')
    .get() as { ok: number } | undefined;
  return !!row;
}

