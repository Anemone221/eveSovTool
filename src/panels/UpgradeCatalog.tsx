import { useEffect, useMemo, useState } from 'react';
import { evesov } from '@/api/evesov';
import type { Upgrade } from '@shared/index';

export function UpgradeCatalog() {
  const [upgrades, setUpgrades] = useState<Upgrade[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    void evesov.data.upgrades().then(setUpgrades);
  }, []);

  const visible = useMemo(() => {
    if (!filter.trim()) return upgrades;
    const q = filter.toLowerCase();
    return upgrades.filter((u) => u.name.toLowerCase().includes(q));
  }, [upgrades, filter]);

  return (
    <div className="catalog">
      <input
        type="search"
        className="catalog__filter"
        placeholder="Filter upgrades…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="catalog__body">
        <table className="grid">
          <thead>
            <tr>
              <th>Name</th>
              <th className="num">Power</th>
              <th className="num">Workforce</th>
              <th className="num">Ice</th>
              <th className="num">Gas</th>
              <th className="num">Startup fuel</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((u) => (
              <tr key={u.name}>
                <td>{u.name}</td>
                <td className={costClass(u.power)}>{fmt(u.power)}</td>
                <td className={costClass(u.workforce)}>{fmt(u.workforce)}</td>
                <td className={costClass(u.superionicIce)}>{fmt(u.superionicIce)}</td>
                <td className={costClass(u.magmaticGas)}>{fmt(u.magmaticGas)}</td>
                <td className="num">{fmt(u.startup)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && upgrades.length > 0 && (
          <p className="catalog__empty">No upgrades match "{filter}".</p>
        )}
        {upgrades.length === 0 && <p className="catalog__empty">Loading…</p>}
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function costClass(n: number): string {
  if (n < 0) return 'num cost-produces';
  return 'num';
}
