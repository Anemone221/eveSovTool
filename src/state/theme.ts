import { evesov } from '@/api/evesov';

export type ThemeName = 'abyss' | 'caldari' | 'high-contrast';

export const THEMES: { id: ThemeName; label: string }[] = [
  { id: 'abyss', label: 'Abyss' },
  { id: 'caldari', label: 'Caldari' },
  { id: 'high-contrast', label: 'High contrast' }
];

export const COLOR_TOKENS: { id: string; label: string; cssVar: string }[] = [
  { id: 'accent', label: 'Accent', cssVar: '--accent' },
  { id: 'ok', label: 'Success', cssVar: '--ok' },
  { id: 'danger', label: 'Danger', cssVar: '--danger' }
];

const THEME_KEY = 'settings.theme';
const COLOR_KEY_PREFIX = 'settings.color.';

export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export function applyColorOverride(token: string, value: string | null): void {
  const def = COLOR_TOKENS.find((t) => t.id === token);
  if (!def) return;
  if (value) {
    document.documentElement.style.setProperty(def.cssVar, value);
  } else {
    document.documentElement.style.removeProperty(def.cssVar);
  }
}

export async function hydrateTheme(): Promise<void> {
  const stored = (await evesov.prefs.get(THEME_KEY)) as ThemeName | null;
  applyTheme(stored ?? 'abyss');
  for (const token of COLOR_TOKENS) {
    const v = await evesov.prefs.get(`${COLOR_KEY_PREFIX}${token.id}`);
    if (v) applyColorOverride(token.id, v);
  }
}

export async function setTheme(theme: ThemeName): Promise<void> {
  applyTheme(theme);
  await evesov.prefs.set(THEME_KEY, theme);
}

export async function getTheme(): Promise<ThemeName> {
  const stored = (await evesov.prefs.get(THEME_KEY)) as ThemeName | null;
  return stored ?? 'abyss';
}

export async function setColorOverride(token: string, value: string): Promise<void> {
  applyColorOverride(token, value);
  await evesov.prefs.set(`${COLOR_KEY_PREFIX}${token}`, value);
}

export async function clearColorOverride(token: string): Promise<void> {
  applyColorOverride(token, null);
  await evesov.prefs.deletePrefix(`${COLOR_KEY_PREFIX}${token}`);
}

export async function getColorOverride(token: string): Promise<string | null> {
  return evesov.prefs.get(`${COLOR_KEY_PREFIX}${token}`);
}
