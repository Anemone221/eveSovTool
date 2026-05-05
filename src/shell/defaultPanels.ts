import { ACTIVITY_PANELS } from './ActivityBar';

export const DEFAULT_PANELS_KEY = 'settings.defaultPanels';

export function parseDefaultPanels(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = new Set(ACTIVITY_PANELS);
    return parsed.filter((id): id is string => typeof id === 'string' && valid.has(id));
  } catch {
    return [];
  }
}
