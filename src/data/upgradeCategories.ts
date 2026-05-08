import { upgradeTypeKey } from '@shared/upgradeTypes';

export type UpgradeCategory =
  | 'Strategic'
  | 'Military'
  | 'Industry'
  | 'System Upgrades'
  | 'Effects';

export const CATEGORY_ORDER: UpgradeCategory[] = [
  'Strategic',
  'Military',
  'Industry',
  'System Upgrades',
  'Effects',
];

const STRATEGIC_NAMES: ReadonlySet<string> = new Set([
  'Advanced Logistics Network',
  'Cynosural Navigation',
  'Cynosural Suppression',
  'Supercapital Construction Facilities',
]);

export function categoryOf(name: string): UpgradeCategory {
  if (STRATEGIC_NAMES.has(name)) return 'Strategic';
  const key = upgradeTypeKey(name);
  if (key === 'threat-minor' || key === 'threat-major') return 'Military';
  if (key && key.startsWith('prospecting-')) return 'Industry';
  if (key === 'workforce' || key === 'power') return 'System Upgrades';
  if (key === 'stability') return 'Effects';
  if (/^Exploration Detector/i.test(name)) return 'Effects';
  return 'Effects';
}
