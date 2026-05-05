interface ActivityItem {
  id: string;
  label: string;
  glyph: string;
}

const ITEMS: ActivityItem[] = [
  { id: 'tree', label: 'Universe', glyph: '⌂' },
  { id: 'system', label: 'System', glyph: '★' },
  { id: 'plans', label: 'Plans', glyph: '◈' },
  { id: 'inspector', label: 'Inspector', glyph: '◯' },
  { id: 'matrix', label: 'Matrix', glyph: '⊞' },
  { id: 'sites', label: 'Sites', glyph: '◊' },
  { id: 'upgrades', label: 'Upgrades', glyph: '◫' },
  { id: 'structures', label: 'Structures', glyph: '⬡' },
  { id: 'regionMap', label: 'Map', glyph: '⊙' },
  { id: 'moonScans', label: 'Moon Scans', glyph: '◎' },
  { id: 'exports', label: 'Exports', glyph: '⤓' },
  { id: 'audit', label: 'Audit', glyph: '⚠' },
  { id: 'settings', label: 'Settings', glyph: '⚙' }
];

interface ActivityBarProps {
  active: string | null;
  onActivate: (id: string) => void;
  onPopOut: (id: string) => void;
}

export function ActivityBar({ active, onActivate, onPopOut }: ActivityBarProps) {
  return (
    <nav className="activity-bar" aria-label="Panels">
      {ITEMS.map((item) => (
        <div key={item.id} className="activity-bar__entry">
          <button
            type="button"
            className={`activity-bar__item${active === item.id ? ' activity-bar__item--active' : ''}`}
            onClick={() => onActivate(item.id)}
            title={item.label}
          >
            <span className="activity-bar__glyph">{item.glyph}</span>
            <span className="activity-bar__label">{item.label}</span>
          </button>
          <button
            type="button"
            className="activity-bar__popout"
            onClick={() => onPopOut(item.id)}
            title={`Pop out ${item.label}`}
            aria-label={`Pop out ${item.label}`}
          >
            ↗
          </button>
        </div>
      ))}
    </nav>
  );
}

export const ACTIVITY_PANELS = ITEMS.map((i) => i.id);
export const ACTIVITY_LABELS: Record<string, string> = Object.fromEntries(
  ITEMS.map((i) => [i.id, i.label])
);
