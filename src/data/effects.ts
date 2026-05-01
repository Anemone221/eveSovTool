export interface SiteGrant {
  site: string;
  count: number;
}

type Tier3 = [SiteGrant[], SiteGrant[], SiteGrant[]];

function bracketOf(sec: number | null): 1 | 2 | 3 | 4 | 5 {
  if (sec === null) return 1;
  if (sec > -0.25) return 1;
  if (sec > -0.45) return 2;
  if (sec > -0.65) return 3;
  if (sec > -0.85) return 4;
  return 5;
}

const MAJOR_THREAT: Record<1 | 2 | 3 | 4 | 5, Tier3> = {
  1: [
    [{ site: 'Hub', count: 2 }, { site: 'Hidden Hub', count: 3 }, { site: 'Forsaken Hub', count: 2 }],
    [{ site: 'Hub', count: 3 }, { site: 'Hidden Hub', count: 3 }, { site: 'Forsaken Hub', count: 3 }, { site: 'Forlorn Hub', count: 2 }, { site: 'Haven', count: 1 }],
    [{ site: 'Hub', count: 4 }, { site: 'Hidden Hub', count: 3 }, { site: 'Forsaken Hub', count: 3 }, { site: 'Forlorn Hub', count: 3 }, { site: 'Haven', count: 2 }]
  ],
  2: [
    [{ site: 'Hub', count: 2 }, { site: 'Hidden Hub', count: 2 }, { site: 'Forsaken Hub', count: 2 }, { site: 'Forlorn Hub', count: 1 }],
    [{ site: 'Hub', count: 2 }, { site: 'Hidden Hub', count: 3 }, { site: 'Forsaken Hub', count: 2 }, { site: 'Forlorn Hub', count: 2 }, { site: 'Haven', count: 2 }],
    [{ site: 'Hub', count: 2 }, { site: 'Hidden Hub', count: 3 }, { site: 'Forsaken Hub', count: 3 }, { site: 'Forlorn Hub', count: 3 }, { site: 'Haven', count: 4 }, { site: 'Sanctum', count: 1 }]
  ],
  3: [
    [{ site: 'Hidden Hub', count: 2 }, { site: 'Forsaken Hub', count: 2 }, { site: 'Forlorn Hub', count: 2 }, { site: 'Haven', count: 1 }],
    [{ site: 'Hidden Hub', count: 3 }, { site: 'Forsaken Hub', count: 3 }, { site: 'Forlorn Hub', count: 3 }, { site: 'Haven', count: 3 }],
    [{ site: 'Hidden Hub', count: 3 }, { site: 'Forsaken Hub', count: 3 }, { site: 'Forlorn Hub', count: 3 }, { site: 'Haven', count: 6 }, { site: 'Sanctum', count: 2 }]
  ],
  4: [
    [{ site: 'Hidden Hub', count: 2 }, { site: 'Forsaken Hub', count: 2 }, { site: 'Forlorn Hub', count: 2 }, { site: 'Haven', count: 2 }],
    [{ site: 'Hidden Hub', count: 2 }, { site: 'Forsaken Hub', count: 2 }, { site: 'Forlorn Hub', count: 2 }, { site: 'Haven', count: 4 }, { site: 'Sanctum', count: 2 }],
    [{ site: 'Hidden Hub', count: 2 }, { site: 'Forsaken Hub', count: 3 }, { site: 'Forlorn Hub', count: 2 }, { site: 'Haven', count: 7 }, { site: 'Sanctum', count: 3 }, { site: 'Forsaken Sanctum', count: 1 }]
  ],
  5: [
    [{ site: 'Forsaken Hub', count: 3 }, { site: 'Forlorn Hub', count: 2 }, { site: 'Haven', count: 2 }, { site: 'Sanctum', count: 1 }],
    [{ site: 'Forsaken Hub', count: 3 }, { site: 'Forlorn Hub', count: 2 }, { site: 'Haven', count: 5 }, { site: 'Sanctum', count: 2 }],
    [{ site: 'Forsaken Hub', count: 2 }, { site: 'Forlorn Hub', count: 2 }, { site: 'Haven', count: 8 }, { site: 'Sanctum', count: 4 }, { site: 'Forsaken Sanctum', count: 3 }]
  ]
};

const MINOR_THREAT: Record<1 | 2 | 3 | 4 | 5, Tier3> = {
  1: [
    [{ site: 'Refuge', count: 2 }, { site: 'Den', count: 2 }, { site: 'Hidden Den', count: 1 }],
    [{ site: 'Refuge', count: 1 }, { site: 'Den', count: 3 }, { site: 'Hidden Den', count: 1 }, { site: 'Forsaken Den', count: 1 }, { site: 'Forlorn Den', count: 1 }, { site: 'Rally Point', count: 2 }, { site: 'Hidden Rally Point', count: 1 }],
    [{ site: 'Refuge', count: 2 }, { site: 'Den', count: 4 }, { site: 'Hidden Den', count: 3 }, { site: 'Forsaken Den', count: 2 }, { site: 'Forlorn Den', count: 1 }, { site: 'Rally Point', count: 2 }, { site: 'Hidden Rally Point', count: 1 }]
  ],
  2: [
    [{ site: 'Refuge', count: 1 }, { site: 'Den', count: 2 }, { site: 'Hidden Den', count: 1 }, { site: 'Forsaken Den', count: 1 }],
    [{ site: 'Refuge', count: 1 }, { site: 'Den', count: 3 }, { site: 'Hidden Den', count: 2 }, { site: 'Forsaken Den', count: 1 }, { site: 'Forlorn Den', count: 1 }, { site: 'Rally Point', count: 2 }, { site: 'Hidden Rally Point', count: 1 }],
    [{ site: 'Refuge', count: 2 }, { site: 'Den', count: 4 }, { site: 'Hidden Den', count: 2 }, { site: 'Forsaken Den', count: 2 }, { site: 'Forlorn Den', count: 1 }, { site: 'Rally Point', count: 2 }, { site: 'Hidden Rally Point', count: 2 }, { site: 'Forsaken Rally Point', count: 1 }]
  ],
  3: [
    [{ site: 'Refuge', count: 1 }, { site: 'Den', count: 2 }, { site: 'Hidden Den', count: 2 }, { site: 'Forsaken Den', count: 1 }],
    [{ site: 'Refuge', count: 1 }, { site: 'Den', count: 2 }, { site: 'Hidden Den', count: 2 }, { site: 'Forsaken Den', count: 2 }, { site: 'Forlorn Den', count: 1 }, { site: 'Rally Point', count: 2 }, { site: 'Hidden Rally Point', count: 1 }],
    [{ site: 'Refuge', count: 1 }, { site: 'Den', count: 4 }, { site: 'Hidden Den', count: 2 }, { site: 'Forsaken Den', count: 2 }, { site: 'Forlorn Den', count: 2 }, { site: 'Rally Point', count: 2 }, { site: 'Hidden Rally Point', count: 1 }, { site: 'Forsaken Rally Point', count: 2 }, { site: 'Forlorn Rally Point', count: 1 }]
  ],
  4: [
    [{ site: 'Den', count: 2 }, { site: 'Hidden Den', count: 1 }, { site: 'Forsaken Den', count: 2 }, { site: 'Forlorn Den', count: 1 }],
    [{ site: 'Den', count: 2 }, { site: 'Hidden Den', count: 2 }, { site: 'Forsaken Den', count: 2 }, { site: 'Forlorn Den', count: 2 }, { site: 'Rally Point', count: 3 }, { site: 'Hidden Rally Point', count: 1 }],
    [{ site: 'Den', count: 2 }, { site: 'Hidden Den', count: 2 }, { site: 'Forsaken Den', count: 2 }, { site: 'Forlorn Den', count: 2 }, { site: 'Rally Point', count: 4 }, { site: 'Hidden Rally Point', count: 2 }, { site: 'Forsaken Rally Point', count: 2 }, { site: 'Forlorn Rally Point', count: 2 }]
  ],
  5: [
    [{ site: 'Den', count: 2 }, { site: 'Hidden Den', count: 1 }, { site: 'Forsaken Den', count: 2 }, { site: 'Forlorn Den', count: 2 }],
    [{ site: 'Den', count: 2 }, { site: 'Hidden Den', count: 2 }, { site: 'Forsaken Den', count: 2 }, { site: 'Forlorn Den', count: 2 }, { site: 'Rally Point', count: 2 }, { site: 'Hidden Rally Point', count: 1 }, { site: 'Forsaken Rally Point', count: 2 }],
    [{ site: 'Den', count: 2 }, { site: 'Hidden Den', count: 2 }, { site: 'Forsaken Den', count: 2 }, { site: 'Forlorn Den', count: 2 }, { site: 'Rally Point', count: 2 }, { site: 'Hidden Rally Point', count: 3 }, { site: 'Forsaken Rally Point', count: 3 }, { site: 'Forlorn Rally Point', count: 3 }]
  ]
};

const PROSPECTING_RE = /^(Tritanium|Pyerite|Mexallon|Isogen|Nocxium|Zydrine|Megacyte) Prospecting Array ([123])$/;
const THREAT_RE = /^(Major|Minor) Threat Detection Array ([123])$/;

export function siteEffectsFor(upgradeName: string, sec: number | null): SiteGrant[] {
  const t = upgradeName.match(THREAT_RE);
  if (t) {
    const tier = (parseInt(t[2], 10) - 1) as 0 | 1 | 2;
    const bracket = bracketOf(sec);
    const table = t[1] === 'Major' ? MAJOR_THREAT : MINOR_THREAT;
    return table[bracket][tier];
  }
  const p = upgradeName.match(PROSPECTING_RE);
  if (p) {
    const ore = p[1];
    const tier = parseInt(p[2], 10);
    const grants: SiteGrant[] = [{ site: `Lvl ${tier} ${ore} Site`, count: 1 }];
    if (tier === 3) grants.push({ site: 'Mercoxit Anomaly', count: 1 });
    return grants;
  }
  return [];
}

export function aggregateGrants(lists: SiteGrant[][]): SiteGrant[] {
  const map = new Map<string, number>();
  for (const list of lists) {
    for (const g of list) map.set(g.site, (map.get(g.site) ?? 0) + g.count);
  }
  return Array.from(map, ([site, count]) => ({ site, count })).sort((a, b) => a.site.localeCompare(b.site));
}

export function formatGrants(grants: SiteGrant[]): string {
  if (grants.length === 0) return '';
  return grants.map((g) => `${g.count}× ${g.site}`).join(', ');
}
