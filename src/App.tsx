import { DockShell } from '@/shell/DockShell';

export function App() {
  return (
    <div className="app-shell">
      <header className="app-shell__header">EVE SOV Planner</header>
      <main className="app-shell__main">
        <DockShell />
      </main>
    </div>
  );
}
