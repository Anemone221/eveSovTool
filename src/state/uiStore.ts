import { create } from 'zustand';
import { evesov } from '@/api/evesov';

const ACTIVE_PLAN_KEY = 'plan.active.v1';

type FocusPanelFn = (panelId: string) => void;

interface UiState {
  selectedSystemId: number | null;
  selectSystem: (id: number | null) => void;
  activePlanId: number | null;
  activePlanReadOnly: boolean;
  setActivePlan: (id: number | null) => void;
  setActivePlanReadOnly: (readOnly: boolean) => void;
  hydrateActivePlan: () => Promise<void>;
  registerFocusPanel: (fn: FocusPanelFn | null) => void;
  focusPanel: FocusPanelFn;
}

let focusPanelImpl: FocusPanelFn | null = null;

export const useUi = create<UiState>((set) => ({
  selectedSystemId: null,
  selectSystem: (id) => set({ selectedSystemId: id }),
  activePlanId: null,
  activePlanReadOnly: false,
  setActivePlan: (id) => {
    set({ activePlanId: id });
    void evesov.prefs.set(ACTIVE_PLAN_KEY, id === null ? '' : String(id));
  },
  setActivePlanReadOnly: (readOnly) => set({ activePlanReadOnly: readOnly }),
  hydrateActivePlan: async () => {
    const v = await evesov.prefs.get(ACTIVE_PLAN_KEY);
    if (v === null || v === '') {
      set({ activePlanId: null });
      return;
    }
    const n = Number(v);
    set({ activePlanId: Number.isFinite(n) ? n : null });
  },
  registerFocusPanel: (fn) => {
    focusPanelImpl = fn;
  },
  focusPanel: (panelId) => {
    focusPanelImpl?.(panelId);
  }
}));
