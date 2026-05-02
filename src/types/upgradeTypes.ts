export function upgradeTypeKey(name: string): string | null {
  if (/^Minor Threat Detection Array/i.test(name)) return 'threat-minor';
  if (/^Major Threat Detection Array/i.test(name)) return 'threat-major';
  const prospecting = name.match(/^([A-Za-z]+) Prospecting Array/i);
  if (prospecting) return `prospecting-${prospecting[1].toLowerCase()}`;
  if (/Stability Gene(?:rator|artor)\b/i.test(name)) return 'stability';
  if (/^Workforce Mecha-Tooling/i.test(name)) return 'workforce';
  if (/^Power Monitoring Division/i.test(name)) return 'power';
  return null;
}

export function upgradeTypeLabel(key: string): string {
  if (key === 'threat-minor') return 'Minor Threat Detection Array';
  if (key === 'threat-major') return 'Major Threat Detection Array';
  if (key.startsWith('prospecting-')) {
    const mineral = key.slice('prospecting-'.length);
    return `${mineral.charAt(0).toUpperCase()}${mineral.slice(1)} Prospecting Array`;
  }
  if (key === 'stability') return 'Stability Generator';
  if (key === 'workforce') return 'Workforce Mecha-Tooling';
  if (key === 'power') return 'Power Monitoring Division';
  return key;
}
