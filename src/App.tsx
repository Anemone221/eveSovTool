import { useEffect, useState } from 'react';
import { DockShell } from '@/shell/DockShell';
import { OpsecRoot } from '@/components/OpsecRoot';
import { evesov } from '@/api/evesov';
import { useUi } from '@/state/uiStore';
import { hydrateTheme } from '@/state/theme';

const APP_NAME = 'Sov Fitting Tool (SFT)';

function AppHeader() {
  const activePlanId = useUi((s) => s.activePlanId);
  const [planName, setPlanName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      if (activePlanId == null) {
        if (!cancelled) setPlanName(null);
        return;
      }
      const list = await evesov.plans.list();
      if (cancelled) return;
      const plan = list.find((p) => p.id === activePlanId);
      setPlanName(plan ? plan.name : null);
    };
    void sync();
    const off = evesov.events.on('plan-changed', () => {
      void sync();
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [activePlanId]);

  return (
    <header className="app-shell__header">
      <span className="app-shell__title">{APP_NAME}</span>
      {planName && (
        <>
          <span className="app-shell__sep"> — </span>
          <span className="app-shell__plan">{planName}</span>
        </>
      )}
    </header>
  );
}

export function App() {
  useEffect(() => {
    void hydrateTheme();
  }, []);

  return (
    <OpsecRoot>
      <div className="app-shell">
        <AppHeader />
        <main className="app-shell__main">
          <DockShell />
        </main>
      </div>
    </OpsecRoot>
  );
}
