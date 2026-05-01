import { useCallback, useEffect, useState } from 'react';
import { evesov } from '@/api/evesov';
import { useUi } from '@/state/uiStore';
import type { PlanSummary } from '@shared/index';

export function PlansPanel() {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [duplicateValue, setDuplicateValue] = useState('');
  const activePlanId = useUi((s) => s.activePlanId);
  const setActivePlan = useUi((s) => s.setActivePlan);

  const refresh = useCallback(async () => {
    const list = await evesov.plans.list();
    setPlans(list);
  }, []);

  useEffect(() => {
    void refresh();
    const off = evesov.events.on('plan-changed', () => {
      void refresh();
    });
    return off;
  }, [refresh]);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const plan = await evesov.plans.create(name);
    setNewName('');
    await refresh();
    setActivePlan(plan.id);
  };

  const rename = async (id: number) => {
    const name = renameValue.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    await evesov.plans.rename(id, name);
    setRenamingId(null);
    setRenameValue('');
    await refresh();
  };

  const remove = async (id: number) => {
    await evesov.plans.delete(id);
    if (activePlanId === id) setActivePlan(null);
    await refresh();
  };

  const startDuplicate = (p: PlanSummary) => {
    setDuplicatingId(p.id);
    setDuplicateValue(uniqueCopyName(p.name, plans.map((x) => x.name)));
  };

  const commitDuplicate = async (sourceId: number) => {
    const trimmed = duplicateValue.trim();
    setDuplicatingId(null);
    setDuplicateValue('');
    if (!trimmed) return;
    const next = await evesov.plans.duplicate(sourceId, trimmed);
    await refresh();
    setActivePlan(next.id);
  };

  const cancelDuplicate = () => {
    setDuplicatingId(null);
    setDuplicateValue('');
  };

  return (
    <div className="plans">
      <form
        className="plans__create"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input
          type="text"
          placeholder="New plan name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" disabled={!newName.trim()}>+ Plan</button>
      </form>
      <ul className="plans__list">
        {plans.flatMap((p) => {
          const items = [
            <li
              key={p.id}
              className={`plans__row${activePlanId === p.id ? ' plans__row--active' : ''}`}
            >
              {renamingId === p.id ? (
                <form
                  className="plans__rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void rename(p.id);
                  }}
                >
                  <input
                    autoFocus
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => setRenamingId(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                  />
                </form>
              ) : (
                <button
                  type="button"
                  className="plans__name"
                  onClick={() => setActivePlan(p.id)}
                  onDoubleClick={() => {
                    setRenameValue(p.name);
                    setRenamingId(p.id);
                  }}
                  title="Click to activate, double-click to rename"
                >
                  {p.name}
                </button>
              )}
              <span className="plans__meta">{formatDate(p.updatedAt)}</span>
              <button
                type="button"
                className="plans__dup"
                title="Duplicate plan"
                aria-label={`Duplicate ${p.name}`}
                onClick={() => startDuplicate(p)}
              >
                ⎘
              </button>
              <button
                type="button"
                className="plans__delete"
                title="Delete plan"
                onClick={() => {
                  if (confirm(`Delete plan "${p.name}"?`)) void remove(p.id);
                }}
              >
                ×
              </button>
            </li>
          ];
          if (duplicatingId === p.id) {
            items.push(
              <li key={`${p.id}-dup`} className="plans__dup-row">
                <form
                  className="plans__rename plans__dup-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void commitDuplicate(p.id);
                  }}
                >
                  <span className="plans__dup-label">Copy as:</span>
                  <input
                    autoFocus
                    type="text"
                    value={duplicateValue}
                    onChange={(e) => setDuplicateValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') cancelDuplicate();
                    }}
                  />
                  <button type="submit" disabled={!duplicateValue.trim()}>Copy</button>
                  <button type="button" onClick={cancelDuplicate}>Cancel</button>
                </form>
              </li>
            );
          }
          return items;
        })}
        {plans.length === 0 && <li className="plans__empty">No plans yet. Create one above.</li>}
      </ul>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function uniqueCopyName(base: string, existing: string[]): string {
  const taken = new Set(existing);
  // strip a trailing " (copy [N])" if it's already a copy, so duplicating "Foo (copy)" suggests "Foo (copy 2)" not "Foo (copy) (copy)"
  const stripped = base.replace(/ \(copy(?: \d+)?\)$/, '');
  let candidate = `${stripped} (copy)`;
  if (!taken.has(candidate)) return candidate;
  let i = 2;
  while (taken.has((candidate = `${stripped} (copy ${i})`))) i++;
  return candidate;
}
