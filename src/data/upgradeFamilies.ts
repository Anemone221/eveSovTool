import type { Upgrade } from '@shared/index';
import { upgradeTypeKey } from '@shared/upgradeTypes';

export type CapacityFlavor = 'yellow' | 'green' | null;

const STABILITY_GENERATOR_RE = /Stability Gene(?:rator|artor)\b/i;

export function isSystemEffectsUpgrade(name: string): boolean {
  if (name.startsWith('Power Monitoring Division')) return true;
  if (name.startsWith('Workforce Mecha-Tooling')) return true;
  if (STABILITY_GENERATOR_RE.test(name)) return true;
  return false;
}

export function classifyCapacity(
  remainingPower: number,
  remainingWorkforce: number,
  catalogue: Upgrade[],
  installedNames: readonly string[] = []
): CapacityFlavor {
  const installedTypes = new Set<string>();
  const installedSet = new Set<string>();
  for (const n of installedNames) {
    installedSet.add(n);
    const k = upgradeTypeKey(n);
    if (k) installedTypes.add(k);
  }
  let anyFits = false;
  let anyNonSystemEffectsFits = false;
  for (const u of catalogue) {
    if (installedSet.has(u.name)) continue;
    const k = upgradeTypeKey(u.name);
    if (k && installedTypes.has(k)) continue;
    if (u.power > remainingPower) continue;
    if (u.workforce > remainingWorkforce) continue;
    anyFits = true;
    if (!isSystemEffectsUpgrade(u.name)) {
      anyNonSystemEffectsFits = true;
      break;
    }
  }
  if (anyNonSystemEffectsFits) return 'green';
  if (anyFits) return 'yellow';
  return null;
}
