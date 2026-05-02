import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type DockviewApi
} from 'dockview-react';
import 'dockview-core/dist/styles/dockview.css';
import { TreeExplorer } from '@/panels/TreeExplorer';
import { SystemDetail } from '@/panels/SystemDetail';
import { UpgradeCatalog } from '@/panels/UpgradeCatalog';
import { PlansPanel } from '@/panels/PlansPanel';
import { PlanInspector } from '@/panels/PlanInspector';
import { AssignmentMatrix } from '@/panels/AssignmentMatrix';
import { SitesOverview } from '@/panels/SitesOverview';
import { StructuresPage } from '@/panels/StructuresPage';
import { ActivityBar } from './ActivityBar';
import { evesov } from '@/api/evesov';
import { useUi } from '@/state/uiStore';

const LAYOUT_KEY = 'dock.layout.v1';
const ACTIVE_KEY = 'dock.active.v1';

const components: Record<string, React.FunctionComponent<IDockviewPanelProps>> = {
  treeExplorer: () => <TreeExplorer />,
  systemDetail: () => <SystemDetail />,
  upgradeCatalog: () => <UpgradeCatalog />,
  plansPanel: () => <PlansPanel />,
  planInspector: () => <PlanInspector />,
  assignmentMatrix: () => <AssignmentMatrix />,
  sitesOverview: () => <SitesOverview />,
  structuresPage: () => <StructuresPage />
};

interface PanelDefinition {
  id: string;
  componentId: string;
  title: string;
  position?: Parameters<DockviewApi['addPanel']>[0]['position'];
}

const PANELS: Record<string, PanelDefinition> = {
  tree: { id: 'tree', componentId: 'treeExplorer', title: 'Universe' },
  system: { id: 'system', componentId: 'systemDetail', title: 'System' },
  plans: { id: 'plans', componentId: 'plansPanel', title: 'Plans' },
  inspector: { id: 'inspector', componentId: 'planInspector', title: 'Plan Inspector' },
  matrix: { id: 'matrix', componentId: 'assignmentMatrix', title: 'Matrix' },
  sites: { id: 'sites', componentId: 'sitesOverview', title: 'Sites' },
  upgrades: { id: 'upgrades', componentId: 'upgradeCatalog', title: 'Upgrades' },
  structures: { id: 'structures', componentId: 'structuresPage', title: 'Structures' }
};

export function DockShell() {
  const apiRef = useRef<DockviewApi | null>(null);
  const [active, setActive] = useState<string | null>('system');
  const persistTimer = useRef<number | null>(null);
  const hydrateActivePlan = useUi((s) => s.hydrateActivePlan);
  const registerFocusPanel = useUi((s) => s.registerFocusPanel);

  useEffect(() => {
    void hydrateActivePlan();
  }, [hydrateActivePlan]);

  const addOrFocus = useCallback((panelId: string) => {
    const api = apiRef.current;
    if (!api) return;
    const def = PANELS[panelId];
    if (!def) return;
    const existing = api.getPanel(def.id);
    if (existing) {
      existing.api.setActive();
      return;
    }
    api.addPanel({
      id: def.id,
      component: def.componentId,
      title: def.title,
      position: def.position
    });
  }, []);

  useEffect(() => {
    registerFocusPanel((panelId) => addOrFocus(panelId));
    return () => registerFocusPanel(null);
  }, [registerFocusPanel, addOrFocus]);

  const onReady = useCallback(async (event: DockviewReadyEvent) => {
    apiRef.current = event.api;

    const saved = await evesov.prefs.get(LAYOUT_KEY);
    let restored = false;
    if (saved) {
      try {
        event.api.fromJSON(JSON.parse(saved));
        restored = true;
      } catch (err) {
        console.warn('Failed to restore dock layout:', err);
      }
    }

    if (!restored) {
      event.api.addPanel({ id: 'tree', component: 'treeExplorer', title: 'Universe' });
      event.api.addPanel({
        id: 'plans',
        component: 'plansPanel',
        title: 'Plans',
        position: { referencePanel: 'tree', direction: 'below' }
      });
      event.api.addPanel({
        id: 'system',
        component: 'systemDetail',
        title: 'System',
        position: { referencePanel: 'tree', direction: 'right' }
      });
      event.api.addPanel({
        id: 'inspector',
        component: 'planInspector',
        title: 'Plan Inspector',
        position: { referencePanel: 'system', direction: 'right' }
      });
      const sys = event.api.getPanel('system');
      sys?.api.setActive();
    }

    const savedActive = await evesov.prefs.get(ACTIVE_KEY);
    if (savedActive) setActive(savedActive);

    const persist = () => {
      if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
      persistTimer.current = window.setTimeout(() => {
        try {
          void evesov.prefs.set(LAYOUT_KEY, JSON.stringify(event.api.toJSON()));
        } catch (err) {
          console.warn('Failed to save dock layout:', err);
        }
      }, 250);
    };

    event.api.onDidLayoutChange(persist);
    event.api.onDidActivePanelChange((panel) => {
      if (panel) {
        setActive(panel.id);
        void evesov.prefs.set(ACTIVE_KEY, panel.id);
      }
    });
  }, []);

  useEffect(() => () => {
    if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
  }, []);

  return (
    <div className="dock-shell">
      <ActivityBar active={active} onActivate={addOrFocus} />
      <div className="dock-shell__main">
        <DockviewReact
          components={components}
          onReady={onReady}
          className="dockview-theme-abyss dock-shell__dockview"
        />
      </div>
    </div>
  );
}
