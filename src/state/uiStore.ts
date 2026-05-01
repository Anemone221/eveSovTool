import { create } from 'zustand';
import { evesov } from '@/api/evesov';

const ACTIVE_PLAN_KEY = 'plan.active.v1';

interface UiState {
  selectedSystemId: number | null;
  selectSystem: (id: number | null) => void;
  activePlanId: number | null;
  setActivePlan: (id: number | null) => void;
  hydrateActivePlan: () => Promise<void>;
}

export const useUi = create<UiState>((set) => ({
  selectedSystemId: null,
  selectSystem: (id) => set({ selectedSystemId: id }),
  activePlanId: null,
  setActivePlan: (id) => {
    set({ activePlanId: id });
    void evesov.prefs.set(ACTIVE_PLAN_KEY, id === null ? '' : String(id));
  },
  hydrateActivePlan: async () => {
    const v = await evesov.prefs.get(ACTIVE_PLAN_KEY);
    if (v === null || v === '') {
      set({ activePlanId: null });
      return;
    }
    const n = Number(v);
    set({ activePlanId: Number.isFinite(n) ? n : null });
  }
}));
