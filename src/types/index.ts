export interface Region {
  id: number;
  name: string;
  factionId: number | null;
}

export interface Constellation {
  id: number;
  regionId: number;
  name: string;
  factionId: number | null;
}

export interface SystemRow {
  id: number;
  constellationId: number;
  regionId: number;
  name: string;
  securityStatus: number | null;
  securityClass: string | null;
}

export interface Star {
  id: number;
  systemId: number;
  spectralClass: string | null;
  description: string | null;
  power: number;
}

export interface Planet {
  id: number;
  systemId: number;
  name: string;
  power: number;
  workforce: number;
  superionicIcePerHour: number;
  magmaticGasPerHour: number;
}

export interface Upgrade {
  name: string;
  power: number;
  workforce: number;
  superionicIce: number;
  magmaticGas: number;
  startup: number;
}

export interface SystemDetail {
  system: SystemRow;
  region: Region;
  constellation: Constellation;
  star: Star | null;
  planets: Planet[];
  budget: SystemBudget;
}

export interface SystemBudget {
  systemId: number;
  availablePower: number;
  availableWorkforce: number;
  availableIce: number;
  availableGas: number;
  sovEligible: boolean;
}

export interface TreeNodeRegion {
  type: 'region';
  id: number;
  name: string;
  constellations: TreeNodeConstellation[];
}

export interface TreeNodeConstellation {
  type: 'constellation';
  id: number;
  name: string;
  systems: TreeNodeSystem[];
}

export interface TreeNodeSystem {
  type: 'system';
  id: number;
  name: string;
  sovEligible: boolean;
  securityStatus: number | null;
}

export interface PlanSummary {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanScope {
  scopeType: 'region' | 'constellation' | 'system';
  scopeId: number;
}

export interface PlanUpgradeRow {
  planId: number;
  systemId: number;
  upgradeName: string;
  ordering: number;
  notes: string | null;
  installed: boolean;
}

export type ClearUpgradesScope =
  | { kind: 'plan' }
  | { kind: 'constellation'; id: number }
  | { kind: 'system'; id: number };

export interface AssignResult {
  ok: boolean;
  error?: string;
  balance?: SystemBalance;
}

export type SystemStatus = 'local' | 'import' | 'export' | 'transit';

export interface SystemBalance {
  systemId: number;
  availablePower: number;
  consumedPower: number;
  availableWorkforce: number;
  consumedWorkforce: number;
  availableIce: number;
  consumedIce: number;
  availableGas: number;
  consumedGas: number;
  startupFuel: number;
  balanced: boolean;
  status: SystemStatus;
}

export interface ImportCounts {
  regions?: number;
  constellations?: number;
  systems?: number;
  stars?: number;
  planets?: number;
  upgrades?: number;
  stargates?: number;
}

export interface ImportWarning {
  source: 'sde' | 'csv';
  file: string;
  row: number;
  message: string;
}

export interface ImportReport {
  counts: ImportCounts;
  warnings: ImportWarning[];
}

export type SovCsvKind = 'stars' | 'planets' | 'upgrades';

export interface RefreshSovArgs {
  kind: SovCsvKind;
  path: string;
}

export type StructureType = 'Ansiblex' | 'Metenox' | 'Athanor' | 'Tatara' | 'Sotiyo' | 'Other';
export type StructureLocation = 'Deep' | 'Planet' | 'Moon' | 'Gate' | 'Ansiblex';
export type StructureSource = 'manual' | 'clipboard' | 'upgrade';

export interface PlanStructure {
  id: number;
  planId: number;
  systemId: number;
  structureType: StructureType;
  name: string | null;
  location: StructureLocation | null;
  moonId: number | null;
  notes: string | null;
  source: StructureSource;
}

export interface StructureAddPayload {
  structureType: StructureType;
  name?: string;
  location?: StructureLocation;
  notes?: string;
}

export interface StructureNode {
  systemId: number;
  systemName: string;
  constellationId: number;
  constellationName: string;
  regionId: number;
  regionName: string;
  structures: PlanStructure[];
}

export interface EveSovApi {
  ping: () => Promise<string>;
  prefs: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
  };
  data: {
    tree: () => Promise<TreeNodeRegion[]>;
    region: (id: number) => Promise<Region | null>;
    constellation: (id: number) => Promise<Constellation | null>;
    system: (id: number) => Promise<SystemDetail | null>;
    upgrades: () => Promise<Upgrade[]>;
    upgrade: (name: string) => Promise<Upgrade | null>;
    refreshSov: (args: RefreshSovArgs) => Promise<ImportReport>;
    exportTemplates: (dir: string) => Promise<{ written: string[] }>;
  };
  plans: {
    list: () => Promise<PlanSummary[]>;
    get: (id: number) => Promise<{ plan: PlanSummary; scopes: PlanScope[]; upgrades: PlanUpgradeRow[]; capitalSystemIds: number[] } | null>;
    create: (name: string) => Promise<PlanSummary>;
    rename: (id: number, name: string) => Promise<PlanSummary>;
    duplicate: (id: number, newName: string) => Promise<PlanSummary>;
    delete: (id: number) => Promise<void>;
    setScopes: (planId: number, scopes: PlanScope[]) => Promise<void>;
    explodeScope: (planId: number, scopeType: 'region' | 'constellation', scopeId: number) => Promise<void>;
    assignUpgrade: (planId: number, systemId: number, upgradeName: string) => Promise<AssignResult>;
    removeUpgrade: (planId: number, systemId: number, upgradeName: string) => Promise<void>;
    removeSystem: (planId: number, systemId: number) => Promise<void>;
    setCapital: (planId: number, systemId: number, isCapital: boolean) => Promise<void>;
    setSystemStatus: (planId: number, systemId: number, status: SystemStatus) => Promise<void>;
    setUpgradeInstalled: (
      planId: number,
      systemId: number,
      upgradeName: string,
      installed: boolean
    ) => Promise<void>;
    clearUpgrades: (planId: number, scope: ClearUpgradesScope) => Promise<void>;
    systemBalance: (planId: number, systemId: number) => Promise<SystemBalance | null>;
    summary: (planId: number) => Promise<PlanRollup>;
    matrix: (planId: number) => Promise<PlanMatrix>;
    setWorkforceTransfer: (planId: number, sourceSystemId: number, destSystemId: number, amount: number, exportAllUnused: boolean) => Promise<SetTransferResult>;
    removeWorkforceTransfer: (planId: number, sourceSystemId: number) => Promise<void>;
    getWorkforceTransfers: (planId: number) => Promise<WorkforceTransfer[]>;
    getReachableImportSystems: (planId: number, sourceSystemId: number) => Promise<{ systemId: number; systemName: string }[]>;
    getAlnTargets: (planId: number, systemId: number) => Promise<{ targets: AlnTarget[]; currentLink: AlnLink | null }>;
    setAlnLink: (planId: number, systemId: number, linkedSystemId: number | null, linkedSystemName: string) => Promise<{ ok: boolean; error?: string }>;
    removeAlnLink: (planId: number, systemId: number) => Promise<void>;
    searchSystems: (query: string) => Promise<{ systemId: number; systemName: string }[]>;
  };
  windows: {
    openPanel: (panelId: string, params?: Record<string, unknown>) => Promise<number>;
    dockBack: (windowId: number) => Promise<void>;
  };
  exports: {
    capturePng: (filename: string, dataUrl: string) => Promise<{ saved: boolean; path?: string }>;
  };
  structures: {
    list: (planId: number, systemId?: number) => Promise<StructureNode[]>;
    add: (planId: number, systemId: number, structure: StructureAddPayload) => Promise<{ id: number }>;
    remove: (planId: number, structureId: number) => Promise<void>;
    importClipboard: (planId: number, systemId: number, text: string) => Promise<{ count: number }>;
  };
  events: {
    on: (channel: 'plan-changed' | 'data-refreshed', listener: (payload: unknown) => void) => () => void;
  };
}

export interface AlnTarget {
  systemId: number;
  systemName: string;
  distanceLy: number;
}

export interface AlnLink {
  linkedSystemId: number | null;
  linkedSystemName: string;
}

export interface WorkforceTransfer {
  sourceSystemId: number;
  sourceName: string;
  destSystemId: number;
  destName: string;
  transferAmount: number;
  exportAllUnused: boolean;
}

export interface SetTransferResult {
  ok: boolean;
  error?: string;
}

export interface PlanRollupRow extends SystemBalance {
  systemName: string;
  constellationId: number;
  constellationName: string;
  regionId: number;
  regionName: string;
  securityStatus: number | null;
  upgrades: string[];
  installedCount: number;
  totalCount: number;
}

export interface PlanRollup {
  planId: number;
  systemBalances: PlanRollupRow[];
  unbalancedSystems: PlanRollupRow[];
  totals: {
    availablePower: number;
    consumedPower: number;
    availableWorkforce: number;
    consumedWorkforce: number;
    availableIce: number;
    consumedIce: number;
    availableGas: number;
    consumedGas: number;
    startupFuel: number;
  };
}

export interface PlanMatrixUpgrade {
  name: string;
  installed: boolean;
}

export interface PlanMatrixUsage {
  power: number;
  workforce: number;
  ice: number;
  gas: number;
}

export interface PlanMatrixSystem {
  id: number;
  name: string;
  constellationId: number;
  constellationName: string;
  regionId: number;
  regionName: string;
  securityStatus: number | null;
  status: SystemStatus;
  upgrades: PlanMatrixUpgrade[];
  usage: PlanMatrixUsage;
  consumedPower: number;
  availablePower: number;
  consumedWorkforce: number;
  availableWorkforce: number;
  alnLink: AlnLink | null;
}

export interface PlanMatrix {
  systems: PlanMatrixSystem[];
}

declare global {
  interface Window {
    evesov: EveSovApi;
  }
}
