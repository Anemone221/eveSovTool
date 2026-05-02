import { DockShell } from '@/shell/DockShell';
import { OpsecRoot } from '@/components/OpsecRoot';

export function App() {
  return (
    <OpsecRoot>
      <div className="app-shell">
        <header className="app-shell__header">EVE SOV Planner</header>
        <main className="app-shell__main">
          <DockShell />
        </main>
      </div>
    </OpsecRoot>
  );
}
