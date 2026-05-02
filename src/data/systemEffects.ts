export interface SystemEffect {
  symbol: string;
  label: string;
  description: string;
}

export const SYSTEM_EFFECTS: Record<string, SystemEffect> = {
  'Electric Stability Generator': {
    symbol: '⚡',
    label: 'Pulsar',
    description: 'Pulsar effect — shield HP and capacitor recharge bonuses; armor HP penalty.'
  },
  'Exotic Stability Generator': {
    symbol: '☄',
    label: 'Wolf-Rayet',
    description: 'Wolf-Rayet effect — armor HP and small weapon damage bonuses; shield HP penalty.'
  },
  'Gamma Stability Generator': {
    symbol: '☢',
    label: 'Magnetar',
    description: 'Magnetar effect — damage projection and weapon damage bonuses; tracking and targeting penalties.'
  },
  // Note: csv has 'Plasma Stability Geneartor' (sic). Match the literal upgrade name.
  'Plasma Stability Geneartor': {
    symbol: '✺',
    label: 'Black Hole',
    description: 'Black Hole effect — velocity, inertia, and missile range bonuses; targeting range and tracking penalties.'
  }
};

export function effectFor(upgradeName: string): SystemEffect | null {
  return SYSTEM_EFFECTS[upgradeName] ?? null;
}

export function effectsForUpgrades(upgradeNames: readonly string[]): SystemEffect[] {
  const seen = new Set<string>();
  const out: SystemEffect[] = [];
  for (const name of upgradeNames) {
    const eff = effectFor(name);
    if (eff && !seen.has(eff.label)) {
      seen.add(eff.label);
      out.push(eff);
    }
  }
  return out;
}
