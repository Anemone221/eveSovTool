import { create } from 'zustand';
import { evesov } from '@/api/evesov';

export type OpsecPreset = string;
export const BUILTIN_PRESETS = ['public', 'internal', 'none', 'custom'] as const;
export type BuiltinPreset = (typeof BUILTIN_PRESETS)[number];

export interface UserPreset {
  name: string;
  flags: OpsecFlags;
  updatedAt: string;
}

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
  hideMoonScans: boolean;
  hideStationIcons: boolean;
  hideUpgradeIcons: boolean;
  hideJumpBridges: boolean;
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
  hideSystemNames: 'opsec.hideSystemNames',
  hideMoonScans: 'opsec.hideMoonScans',
  hideStationIcons: 'opsec.hideStationIcons',
  hideUpgradeIcons: 'opsec.hideUpgradeIcons',
  hideJumpBridges: 'opsec.hideJumpBridges'
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
  hideSystemNames: 'Hide system names',
  hideMoonScans: 'Hide moon scan data',
  hideStationIcons: 'Hide station/structure icons',
  hideUpgradeIcons: 'Hide upgrade icons',
  hideJumpBridges: 'Hide jump bridge lines'
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
  hideSystemNames: false,
  hideMoonScans: false,
  hideStationIcons: false,
  hideUpgradeIcons: false,
  hideJumpBridges: false
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
    hideSystemNames: true,
    hideMoonScans: true,
    hideStationIcons: true,
    hideUpgradeIcons: true,
    hideJumpBridges: true
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
  userPresets: UserPreset[];
  hydrated: boolean;
  captureActive: boolean;
  hydrate: () => Promise<void>;
  setFlag: (key: keyof OpsecFlags, value: boolean) => Promise<void>;
  applyPreset: (preset: 'public' | 'internal') => Promise<void>;
  applyUserPreset: (name: string) => Promise<void>;
  saveUserPreset: (name: string) => Promise<void>;
  deleteUserPreset: (name: string) => Promise<void>;
  clearAll: () => Promise<void>;
  setCaptureActive: (v: boolean) => void;
}

function flagsEqual(a: OpsecFlags, b: OpsecFlags): boolean {
  return (Object.keys(a) as (keyof OpsecFlags)[]).every((k) => a[k] === b[k]);
}

function presetFor(flags: OpsecFlags, userPresets: UserPreset[] = []): OpsecPreset {
  if (Object.values(flags).every((v) => !v)) return 'none';
  for (const name of ['public', 'internal'] as const) {
    if (flagsEqual(flags, PRESETS[name])) return name;
  }
  for (const up of userPresets) {
    if (flagsEqual(flags, up.flags)) return up.name;
  }
  return 'custom';
}

function normalizeFlags(raw: Record<string, boolean>): OpsecFlags {
  const out: OpsecFlags = { ...DEFAULTS };
  for (const k of Object.keys(FLAG_KEYS) as (keyof OpsecFlags)[]) {
    if (typeof raw[k] === 'boolean') out[k] = raw[k];
  }
  return out;
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

async function writeAllFlags(flags: OpsecFlags): Promise<void> {
  await Promise.all(
    (Object.keys(FLAG_KEYS) as (keyof OpsecFlags)[]).map((k) =>
      evesov.exports.setConfig(FLAG_KEYS[k], flags[k] ? '1' : '0')
    )
  );
}

async function fetchUserPresets(): Promise<UserPreset[]> {
  const rows = await evesov.exports.listOpsecPresets();
  return rows.map((r) => ({
    name: r.name,
    flags: normalizeFlags(r.flags),
    updatedAt: r.updatedAt
  }));
}

export const useOpsec = create<OpsecState>((set, get) => ({
  flags: DEFAULTS,
  preset: 'none',
  userPresets: [],
  hydrated: false,
  captureActive: false,
  setCaptureActive: (v) => set({ captureActive: v }),
  hydrate: async () => {
    if (get().hydrated) return;
    const [cfg, userPresets] = await Promise.all([
      evesov.exports.getConfig(),
      fetchUserPresets()
    ]);
    const next: OpsecFlags = { ...DEFAULTS };
    for (const k of Object.keys(FLAG_KEYS) as (keyof OpsecFlags)[]) {
      next[k] = cfg[FLAG_KEYS[k]] === '1';
    }
    set({
      flags: next,
      preset: presetFor(next, userPresets),
      userPresets,
      hydrated: true
    });
  },
  setFlag: async (key, value) => {
    const next = { ...get().flags, [key]: value };
    set({ flags: next, preset: presetFor(next, get().userPresets) });
    await evesov.exports.setConfig(FLAG_KEYS[key], value ? '1' : '0');
  },
  applyPreset: async (preset) => {
    const next = PRESETS[preset];
    set({ flags: next, preset });
    await writeAllFlags(next);
  },
  applyUserPreset: async (name) => {
    const up = get().userPresets.find((p) => p.name === name);
    if (!up) return;
    set({ flags: up.flags, preset: up.name });
    await writeAllFlags(up.flags);
  },
  saveUserPreset: async (name) => {
    const flags = get().flags;
    await evesov.exports.saveOpsecPreset(name, { ...flags } as Record<string, boolean>);
    const userPresets = await fetchUserPresets();
    set({ userPresets, preset: name });
  },
  deleteUserPreset: async (name) => {
    await evesov.exports.deleteOpsecPreset(name);
    const userPresets = await fetchUserPresets();
    const currentPreset = get().preset;
    const nextPreset =
      currentPreset === name ? presetFor(get().flags, userPresets) : currentPreset;
    set({ userPresets, preset: nextPreset });
  },
  clearAll: async () => {
    set({ flags: DEFAULTS, preset: 'none' });
    await writeAllFlags(DEFAULTS);
  }
}));
