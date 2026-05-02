import { create } from 'zustand';
import { evesov } from '@/api/evesov';

export type OpsecPreset = 'public' | 'internal' | 'custom' | 'none';

export interface OpsecFlags {
  workforceHidePercent: boolean;
  workforceHideCount: boolean;
  workforceHideVisual: boolean;
  powerHidePercent: boolean;
  powerHideCount: boolean;
  powerHideVisual: boolean;
  hideSupercaps: boolean;
  hideSystemEffects: boolean;
  hideTransferRoute: boolean;
  hideGasIceBalance: boolean;
  hideSystemNames: boolean;
}

export const FLAG_KEYS: Record<keyof OpsecFlags, string> = {
  workforceHidePercent: 'opsec.workforce.hidePercent',
  workforceHideCount: 'opsec.workforce.hideCount',
  workforceHideVisual: 'opsec.workforce.hideVisual',
  powerHidePercent: 'opsec.power.hidePercent',
  powerHideCount: 'opsec.power.hideCount',
  powerHideVisual: 'opsec.power.hideVisual',
  hideSupercaps: 'opsec.hideSupercaps',
  hideSystemEffects: 'opsec.hideSystemEffects',
  hideTransferRoute: 'opsec.hideTransferRoute',
  hideGasIceBalance: 'opsec.hideGasIceBalance',
  hideSystemNames: 'opsec.hideSystemNames'
};

export const FLAG_LABELS: Record<keyof OpsecFlags, string> = {
  workforceHidePercent: 'Workforce — hide %',
  workforceHideCount: 'Workforce — hide count',
  workforceHideVisual: 'Workforce — hide visual cues',
  powerHidePercent: 'Power — hide %',
  powerHideCount: 'Power — hide count',
  powerHideVisual: 'Power — hide visual cues',
  hideSupercaps: 'Hide supercapital upgrades',
  hideSystemEffects: 'Hide system effect locations',
  hideTransferRoute: 'Hide importer/exporter routes',
  hideGasIceBalance: 'Hide gas/ice over-under',
  hideSystemNames: 'Hide system names'
};

const DEFAULTS: OpsecFlags = {
  workforceHidePercent: false,
  workforceHideCount: false,
  workforceHideVisual: false,
  powerHidePercent: false,
  powerHideCount: false,
  powerHideVisual: false,
  hideSupercaps: false,
  hideSystemEffects: false,
  hideTransferRoute: false,
  hideGasIceBalance: false,
  hideSystemNames: false
};

const PRESETS: Record<Exclude<OpsecPreset, 'custom' | 'none'>, OpsecFlags> = {
  public: {
    workforceHidePercent: true,
    workforceHideCount: true,
    workforceHideVisual: true,
    powerHidePercent: true,
    powerHideCount: true,
    powerHideVisual: true,
    hideSupercaps: true,
    hideSystemEffects: true,
    hideTransferRoute: true,
    hideGasIceBalance: true,
    hideSystemNames: true
  },
  internal: {
    ...DEFAULTS,
    workforceHideVisual: true,
    powerHideVisual: true,
    hideTransferRoute: true,
    hideGasIceBalance: true
  }
};

interface OpsecState {
  flags: OpsecFlags;
  preset: OpsecPreset;
  hydrated: boolean;
  captureActive: boolean;
  hydrate: () => Promise<void>;
  setFlag: (key: keyof OpsecFlags, value: boolean) => Promise<void>;
  applyPreset: (preset: 'public' | 'internal') => Promise<void>;
  clearAll: () => Promise<void>;
  setCaptureActive: (v: boolean) => void;
}

function presetFor(flags: OpsecFlags): OpsecPreset {
  if (Object.values(flags).every((v) => !v)) return 'none';
  for (const name of ['public', 'internal'] as const) {
    const preset = PRESETS[name];
    if ((Object.keys(flags) as (keyof OpsecFlags)[]).every((k) => flags[k] === preset[k])) {
      return name;
    }
  }
  return 'custom';
}

/**
 * Returns the flags that should currently affect rendering.
 * Off-export: every flag is `false` so live UI is never redacted.
 * During export capture: real flags apply.
 */
export function useEffectiveOpsec(): OpsecFlags {
  return useOpsec((s) => (s.captureActive ? s.flags : DEFAULTS));
}

export function activeFlagLabels(flags: OpsecFlags): string[] {
  return (Object.keys(flags) as (keyof OpsecFlags)[])
    .filter((k) => flags[k])
    .map((k) => FLAG_LABELS[k]);
}

export const useOpsec = create<OpsecState>((set, get) => ({
  flags: DEFAULTS,
  preset: 'none',
  hydrated: false,
  captureActive: false,
  setCaptureActive: (v) => set({ captureActive: v }),
  hydrate: async () => {
    if (get().hydrated) return;
    const cfg = await evesov.exports.getConfig();
    const next: OpsecFlags = { ...DEFAULTS };
    for (const k of Object.keys(FLAG_KEYS) as (keyof OpsecFlags)[]) {
      next[k] = cfg[FLAG_KEYS[k]] === '1';
    }
    set({ flags: next, preset: presetFor(next), hydrated: true });
  },
  setFlag: async (key, value) => {
    const next = { ...get().flags, [key]: value };
    set({ flags: next, preset: presetFor(next) });
    await evesov.exports.setConfig(FLAG_KEYS[key], value ? '1' : '0');
  },
  applyPreset: async (preset) => {
    const next = PRESETS[preset];
    set({ flags: next, preset });
    await Promise.all(
      (Object.keys(FLAG_KEYS) as (keyof OpsecFlags)[]).map((k) =>
        evesov.exports.setConfig(FLAG_KEYS[k], next[k] ? '1' : '0')
      )
    );
  },
  clearAll: async () => {
    set({ flags: DEFAULTS, preset: 'none' });
    await Promise.all(
      (Object.keys(FLAG_KEYS) as (keyof OpsecFlags)[]).map((k) =>
        evesov.exports.setConfig(FLAG_KEYS[k], '0')
      )
    );
  }
}));
