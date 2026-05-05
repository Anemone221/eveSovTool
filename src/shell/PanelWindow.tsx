import { evesov } from '@/api/evesov';
import { AssignmentMatrix } from '@/panels/AssignmentMatrix';
import { AuditPanel } from '@/panels/AuditPanel';
import { ExportsPage } from '@/panels/ExportsPage';
import { MoonScansPage } from '@/panels/MoonScansPage';
import { PlanInspector } from '@/panels/PlanInspector';
import { PlansPanel } from '@/panels/PlansPanel';
import { RegionMap } from '@/panels/RegionMap';
import { SettingsPage } from '@/panels/SettingsPage';
import { SitesOverview } from '@/panels/SitesOverview';
import { StructuresPage } from '@/panels/StructuresPage';
import { SystemDetail } from '@/panels/SystemDetail';
import { TreeExplorer } from '@/panels/TreeExplorer';
import { UpgradeCatalog } from '@/panels/UpgradeCatalog';
import { useUi } from '@/state/uiStore';
import { useOpsec } from '@/state/opsecStore';
import { useEffect, useState } from 'react';

const PANEL_MAP: Record<string, React.ReactNode> = {
  tree: <TreeExplorer />,
  system: <SystemDetail />,
  plans: <PlansPanel />,
  inspector: <PlanInspector />,
  matrix: <AssignmentMatrix />,
  sites: <SitesOverview />,
  upgrades: <UpgradeCatalog />,
  structures: <StructuresPage />,
  regionMap: <RegionMap />,
  moonScans: <MoonScansPage />,
  exports: <ExportsPage />,
  audit: <AuditPanel />,
  settings: <SettingsPage />,
};

const PANEL_TITLES: Record<string, string> = {
  tree: 'Universe',
  system: 'System',
  plans: 'Plans',
  inspector: 'Plan Inspector',
  matrix: 'Matrix',
  sites: 'Sites',
  upgrades: 'Upgrades',
  structures: 'Structures',
  regionMap: 'Map',
  moonScans: 'Moon Scans',
  exports: 'Exports',
  audit: 'Audit',
  settings: 'Settings',
};

interface PanelWindowProps {
  panelId: string;
}

export function PanelWindow({ panelId }: PanelWindowProps) {
  const hydrateActivePlan = useUi((s) => s.hydrateActivePlan);
  const selectSystem = useUi((s) => s.selectSystem);
  const hydrateOpsec = useOpsec((s) => s.hydrate);
  const [docking, setDocking] = useState(false);

  useEffect(() => {
    void hydrateActivePlan();
    void hydrateOpsec();
  }, [hydrateActivePlan, hydrateOpsec]);

  useEffect(() => {
    return evesov.events.on('plan-active-changed', () => {
      void hydrateActivePlan();
    });
  }, [hydrateActivePlan]);

  useEffect(() => {
    return evesov.events.on('selected-system-changed', (payload) => {
      const { systemId } = payload as { systemId: number };
      selectSystem(systemId);
    });
  }, [selectSystem]);

  const content = PANEL_MAP[panelId];
  const title = PANEL_TITLES[panelId] ?? panelId;

  const handleDockBack = async () => {
    setDocking(true);
    try {
      await evesov.windows.dockBack(-1); // id ignored; main uses sender webContents
    } finally {
      setDocking(false);
    }
  };

  if (!content) {
    return (
      <div className="panel-window panel-window--unknown">
        <p>Unknown panel: {panelId}</p>
      </div>
    );
  }

  return (
    <div className="panel-window">
      <div className="panel-window__bar">
        <span className="panel-window__title">{title}</span>
        <button
          type="button"
          className="panel-window__dock-btn"
          onClick={handleDockBack}
          disabled={docking}
          title="Dock back to main window"
        >
          ⤓ Dock back
        </button>
      </div>
      <div className="panel-window__content">{content}</div>
    </div>
  );
}
