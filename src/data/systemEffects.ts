import { STABILITY_ICONS, cynoBeacon, cynoJammer, jumpPortal } from '@/data/mapIcons';

export interface SystemEffect {
  icon: string;
  label: string;
  description: string;
}

const EFFECT_TEXT: Record<string, { label: string; description: string }> = {
  'Gamma Stability Generator': {
    label: 'Gamma',
    description: '+15% Shield HP, +10% Capacitor capacity',
  },
  'Plasma Stability Geneartor': {
    label: 'Plasma',
    description: '+15% Armor HP, +10% bonus to overheat benefits',
  },
  'Electric Stability Generator': {
    label: 'Electric',
    description: '+25% Capacitor recharge rate, +25% targeting & D-Scan range',
  },
  'Exotic Stability Generator': {
    label: 'Exotic',
    description: '+25% scan resolution, +2 AU/s warp speed',
  },
};

export function effectFor(upgradeName: string): SystemEffect | null {
  const text = EFFECT_TEXT[upgradeName];
  const icon = STABILITY_ICONS[upgradeName];
  if (!text || !icon) return null;
  return { icon, label: text.label, description: text.description };
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

export interface UpgradeBadge {
  key: string;
  icon: string;
  label: string;
  description: string;
}

const UPGRADE_BADGES: Record<string, { icon: string; label: string; description: string }> = {
  'Cynosural Navigation': {
    icon: cynoBeacon,
    label: 'Cyno Beacon',
    description: 'Cynosural Navigation — system-wide cyno beacon',
  },
  'Cynosural Suppression': {
    icon: cynoJammer,
    label: 'Cyno Jammer',
    description: 'Cynosural Suppression — system-wide cyno jammer',
  },
  'Advanced Logistics Network': {
    icon: jumpPortal,
    label: 'Ansiblex',
    description: 'Advanced Logistics Network — Ansiblex jump bridge',
  },
};

const UPGRADE_BADGE_ORDER: string[] = [
  'Cynosural Navigation',
  'Cynosural Suppression',
  'Advanced Logistics Network'
];

export function badgesForUpgrades(upgradeNames: readonly string[]): UpgradeBadge[] {
  const present = new Set(upgradeNames);
  const seen = new Set<string>();
  const out: UpgradeBadge[] = [];
  for (const eff of effectsForUpgrades(upgradeNames)) {
    out.push({ key: `eff:${eff.label}`, icon: eff.icon, label: eff.label, description: `${eff.label} Stability — ${eff.description}` });
    seen.add(eff.label);
  }
  for (const name of UPGRADE_BADGE_ORDER) {
    if (!present.has(name)) continue;
    const b = UPGRADE_BADGES[name];
    if (b && !seen.has(b.label)) {
      seen.add(b.label);
      out.push({ key: `up:${b.label}`, icon: b.icon, label: b.label, description: b.description });
    }
  }
  return out;
}
