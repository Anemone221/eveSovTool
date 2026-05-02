import { create } from 'zustand';

export type ExportablePanel = 'matrix' | 'sites' | 'regionMap';

export type ExportHandler = () => Promise<void>;

interface ExportRegistryState {
  handlers: Partial<Record<ExportablePanel, ExportHandler>>;
  register: (panel: ExportablePanel, handler: ExportHandler) => void;
  unregister: (panel: ExportablePanel) => void;
}

export const useExportRegistry = create<ExportRegistryState>((set) => ({
  handlers: {},
  register: (panel, handler) =>
    set((s) => ({ handlers: { ...s.handlers, [panel]: handler } })),
  unregister: (panel) =>
    set((s) => {
      const next = { ...s.handlers };
      delete next[panel];
      return { handlers: next };
    })
}));
