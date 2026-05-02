export type ExportPanel = 'matrix' | 'sites' | 'regionMap' | 'systemDetail' | 'inspector';

const PANEL_LABELS: Record<ExportPanel, string> = {
  matrix: 'Matrix',
  sites: 'Sites',
  regionMap: 'RegionMap',
  systemDetail: 'System',
  inspector: 'Inspector'
};

function sanitise(part: string): string {
  return part.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
}

function timestamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function buildExportFilename(args: {
  planName: string;
  panel: ExportPanel;
  systemName?: string | null;
  date?: Date;
}): string {
  const parts = [
    sanitise(args.planName || 'Plan'),
    sanitise(PANEL_LABELS[args.panel]),
    args.systemName ? sanitise(args.systemName) : '',
    timestamp(args.date)
  ].filter(Boolean);
  return `${parts.join('_')}.png`;
}
