import { deflateRawSync, inflateRawSync } from 'node:zlib';

export const SLOT_NAMES = [
  'threat-minor',
  'threat-major',
  'prospecting-tritanium',
  'prospecting-pyerite',
  'prospecting-mexallon',
  'prospecting-isogen',
  'prospecting-nocxium',
  'prospecting-zydrine',
  'prospecting-megacyte',
  'workforce',
  'power',
  'exploration-detector',
  'stability',
  'aln',
  'cyno-nav',
  'cyno-sup',
  'supercap-cnst'
] as const;
export type SlotName = (typeof SLOT_NAMES)[number];

interface SlotDef {
  bitOffset: number;
  bitWidth: number;
  maxValue: number;
}

const SLOT_DEFS: Record<SlotName, SlotDef> = {
  'threat-minor':          { bitOffset: 0,  bitWidth: 2, maxValue: 3 },
  'threat-major':          { bitOffset: 2,  bitWidth: 2, maxValue: 3 },
  'prospecting-tritanium': { bitOffset: 4,  bitWidth: 2, maxValue: 3 },
  'prospecting-pyerite':   { bitOffset: 6,  bitWidth: 2, maxValue: 3 },
  'prospecting-mexallon':  { bitOffset: 8,  bitWidth: 2, maxValue: 3 },
  'prospecting-isogen':    { bitOffset: 10, bitWidth: 2, maxValue: 3 },
  'prospecting-nocxium':   { bitOffset: 12, bitWidth: 2, maxValue: 3 },
  'prospecting-zydrine':   { bitOffset: 14, bitWidth: 2, maxValue: 3 },
  'prospecting-megacyte':  { bitOffset: 16, bitWidth: 2, maxValue: 3 },
  'workforce':             { bitOffset: 18, bitWidth: 2, maxValue: 3 },
  'power':                 { bitOffset: 20, bitWidth: 2, maxValue: 3 },
  'exploration-detector':  { bitOffset: 22, bitWidth: 2, maxValue: 3 },
  'stability':             { bitOffset: 24, bitWidth: 3, maxValue: 4 },
  'aln':                   { bitOffset: 27, bitWidth: 1, maxValue: 1 },
  'cyno-nav':              { bitOffset: 28, bitWidth: 1, maxValue: 1 },
  'cyno-sup':              { bitOffset: 29, bitWidth: 1, maxValue: 1 },
  'supercap-cnst':         { bitOffset: 30, bitWidth: 1, maxValue: 1 }
};

const NAME_TO_SLOT: Record<string, { slot: SlotName; value: number }> = {
  'Minor Threat Detection Array 1': { slot: 'threat-minor', value: 1 },
  'Minor Threat Detection Array 2': { slot: 'threat-minor', value: 2 },
  'Minor Threat Detection Array 3': { slot: 'threat-minor', value: 3 },
  'Major Threat Detection Array 1': { slot: 'threat-major', value: 1 },
  'Major Threat Detection Array 2': { slot: 'threat-major', value: 2 },
  'Major Threat Detection Array 3': { slot: 'threat-major', value: 3 },
  'Tritanium Prospecting Array 1': { slot: 'prospecting-tritanium', value: 1 },
  'Tritanium Prospecting Array 2': { slot: 'prospecting-tritanium', value: 2 },
  'Tritanium Prospecting Array 3': { slot: 'prospecting-tritanium', value: 3 },
  'Pyerite Prospecting Array 1': { slot: 'prospecting-pyerite', value: 1 },
  'Pyerite Prospecting Array 2': { slot: 'prospecting-pyerite', value: 2 },
  'Pyerite Prospecting Array 3': { slot: 'prospecting-pyerite', value: 3 },
  'Mexallon Prospecting Array 1': { slot: 'prospecting-mexallon', value: 1 },
  'Mexallon Prospecting Array 2': { slot: 'prospecting-mexallon', value: 2 },
  'Mexallon Prospecting Array 3': { slot: 'prospecting-mexallon', value: 3 },
  'Isogen Prospecting Array 1': { slot: 'prospecting-isogen', value: 1 },
  'Isogen Prospecting Array 2': { slot: 'prospecting-isogen', value: 2 },
  'Isogen Prospecting Array 3': { slot: 'prospecting-isogen', value: 3 },
  'Nocxium Prospecting Array 1': { slot: 'prospecting-nocxium', value: 1 },
  'Nocxium Prospecting Array 2': { slot: 'prospecting-nocxium', value: 2 },
  'Nocxium Prospecting Array 3': { slot: 'prospecting-nocxium', value: 3 },
  'Zydrine Prospecting Array 1': { slot: 'prospecting-zydrine', value: 1 },
  'Zydrine Prospecting Array 2': { slot: 'prospecting-zydrine', value: 2 },
  'Zydrine Prospecting Array 3': { slot: 'prospecting-zydrine', value: 3 },
  'Megacyte Prospecting Array 1': { slot: 'prospecting-megacyte', value: 1 },
  'Megacyte Prospecting Array 2': { slot: 'prospecting-megacyte', value: 2 },
  'Megacyte Prospecting Array 3': { slot: 'prospecting-megacyte', value: 3 },
  'Workforce Mecha-Tooling 1': { slot: 'workforce', value: 1 },
  'Workforce Mecha-Tooling 2': { slot: 'workforce', value: 2 },
  'Workforce Mecha-Tooling 3': { slot: 'workforce', value: 3 },
  'Power Monitoring Division 1': { slot: 'power', value: 1 },
  'Power Monitoring Division 2': { slot: 'power', value: 2 },
  'Power Monitoring Division 3': { slot: 'power', value: 3 },
  'Exploration Detector 1': { slot: 'exploration-detector', value: 1 },
  'Exploration Detector 2': { slot: 'exploration-detector', value: 2 },
  'Exploration Detector 3': { slot: 'exploration-detector', value: 3 },
  'Electric Stability Generator': { slot: 'stability', value: 1 },
  'Exotic Stability Generator': { slot: 'stability', value: 2 },
  'Gamma Stability Generator': { slot: 'stability', value: 3 },
  // The CSV ships "Plasma Stability Geneartor" (sic). Round-trip the typo verbatim.
  'Plasma Stability Geneartor': { slot: 'stability', value: 4 },
  'Advanced Logistics Network': { slot: 'aln', value: 1 },
  'Cynosural Navigation': { slot: 'cyno-nav', value: 1 },
  'Cynosural Suppression': { slot: 'cyno-sup', value: 1 },
  'Supercapital Construction Facilities': { slot: 'supercap-cnst', value: 1 }
};

const SLOT_TO_NAME = new Map<string, string>();
for (const [name, m] of Object.entries(NAME_TO_SLOT)) {
  SLOT_TO_NAME.set(`${m.slot}:${m.value}`, name);
}

const STATUS_BY_CODE = ['local', 'import', 'export', 'transit'] as const;
const STATUS_TO_CODE: Record<(typeof STATUS_BY_CODE)[number], number> = {
  local: 0,
  import: 1,
  export: 2,
  transit: 3
};

const NAME_REGEX = /^[\w\s\-_.()]+$/;

export const MAX_PLAN_NAME = 64;
export const MAX_SCOPES = 1000;
export const MAX_SYSTEMS = 10_000;
export const MAX_TRANSFER = 1_000_000_000;
export const MAX_BINARY_PAYLOAD = 1024 * 1024;
export const MAX_DNA_LENGTH = 256 * 1024;
export const MAX_TEXT_LENGTH = 1024 * 1024;

export const SCOPE_TYPE_BY_CODE = ['region', 'constellation', 'system'] as const;
const SCOPE_CODE: Record<'region' | 'constellation' | 'system', number> = {
  region: 0,
  constellation: 1,
  system: 2
};

export interface DnaPlanData {
  name: string;
  scopes: { scopeType: 'region' | 'constellation' | 'system'; scopeId: number }[];
  systems: DnaSystemEntry[];
}

export interface DnaSystemEntry {
  systemId: number;
  upgrades: string[];
  status: 'local' | 'import' | 'export' | 'transit';
  transferAmount: number;
  destinationSystemId: number | null;
  exportAllUnused: boolean;
  isCapital: boolean;
  alnLinkedSystemId: number | null;
}

export interface ValidatedDna {
  name: string;
  scopes: { scopeType: 'region' | 'constellation' | 'system'; scopeId: number }[];
  upgrades: { systemId: number; upgradeName: string; installed: 0 | 1; ordering: number }[];
  systemStatus: {
    systemId: number;
    status: 'local' | 'import' | 'export' | 'transit';
    transferAmount: number;
    destinationSystemId: number | null;
    exportAllUnused: 0 | 1;
  }[];
  capitalSystems: number[];
  alnLinks: { systemId: number; linkedSystemId: number; linkedSystemName: string }[];
}

export function packState(slots: Partial<Record<SlotName, number>>): number {
  let mask = 0;
  for (const slot of SLOT_NAMES) {
    const v = slots[slot];
    if (v === undefined || v === 0) continue;
    const def = SLOT_DEFS[slot];
    if (!Number.isInteger(v) || v < 1 || v > def.maxValue) {
      throw new Error(`Slot ${slot} value ${v} out of range`);
    }
    mask |= v << def.bitOffset;
  }
  return mask >>> 0;
}

export function unpackState(mask: number): Array<{ slot: SlotName; value: number }> {
  const out: Array<{ slot: SlotName; value: number }> = [];
  for (const slot of SLOT_NAMES) {
    const def = SLOT_DEFS[slot];
    const v = (mask >>> def.bitOffset) & ((1 << def.bitWidth) - 1);
    if (v === 0) continue;
    if (v > def.maxValue) {
      throw new Error(`Slot ${slot} value ${v} exceeds max ${def.maxValue}`);
    }
    out.push({ slot, value: v });
  }
  return out;
}

export function maskFromUpgradeNames(names: string[]): number {
  const slots: Partial<Record<SlotName, number>> = {};
  for (const name of names) {
    const m = NAME_TO_SLOT[name];
    if (!m) throw new Error(`Unknown upgrade "${name}"`);
    if (slots[m.slot] !== undefined) {
      throw new Error(`Two upgrades target slot "${m.slot}" in one system`);
    }
    slots[m.slot] = m.value;
  }
  return packState(slots);
}

export function upgradeNamesFromMask(mask: number): string[] {
  return unpackState(mask).map(({ slot, value }) => {
    const name = SLOT_TO_NAME.get(`${slot}:${value}`);
    if (!name) throw new Error(`No upgrade for slot ${slot} value ${value}`);
    return name;
  });
}

// ---- Binary writer / reader ----

class Writer {
  private chunks: number[] = [];
  u8(v: number): void {
    this.chunks.push(v & 0xff);
  }
  u32(v: number): void {
    this.chunks.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  }
  varint(v: number): void {
    if (!Number.isInteger(v) || v < 0) throw new Error('varint requires non-negative integer');
    while (v > 0x7f) {
      this.chunks.push((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    this.chunks.push(v & 0x7f);
  }
  bytes(buf: Uint8Array): void {
    for (const b of buf) this.chunks.push(b);
  }
  toBuffer(): Buffer {
    return Buffer.from(this.chunks);
  }
}

class Reader {
  private pos = 0;
  constructor(private buf: Buffer) {}
  remaining(): number {
    return this.buf.length - this.pos;
  }
  u8(): number {
    if (this.pos >= this.buf.length) throw new Error('Unexpected end of payload');
    return this.buf[this.pos++];
  }
  u32(): number {
    if (this.pos + 4 > this.buf.length) throw new Error('Unexpected end of payload');
    const v =
      this.buf[this.pos] |
      (this.buf[this.pos + 1] << 8) |
      (this.buf[this.pos + 2] << 16) |
      (this.buf[this.pos + 3] << 24);
    this.pos += 4;
    return v >>> 0;
  }
  varint(): number {
    let result = 0;
    let shift = 1;
    let bytes = 0;
    while (true) {
      if (this.pos >= this.buf.length) throw new Error('Truncated varint');
      const b = this.buf[this.pos++];
      result += (b & 0x7f) * shift;
      bytes += 1;
      if (bytes > 9) throw new Error('Varint too long');
      if (!(b & 0x80)) break;
      shift *= 128;
    }
    if (!Number.isSafeInteger(result)) throw new Error('Varint out of safe range');
    return result;
  }
  bytes(n: number): Buffer {
    if (this.pos + n > this.buf.length) throw new Error('Unexpected end of payload');
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

const VERSION = 2;
const FLAG_INCLUDE_SCOPES = 0x01;
const FLAG_INCLUDE_CAPITALS = 0x02;

const STATUS_BIT_EXPORT_ALL = 2;
const STATUS_BIT_HAS_DEST = 3;
const STATUS_BIT_HAS_TRANSFER = 4;
const STATUS_BIT_IS_CAPITAL = 5;
const STATUS_BIT_HAS_ALN = 6;

function isDefaultSystem(s: DnaSystemEntry): boolean {
  return (
    s.upgrades.length === 0 &&
    s.status === 'local' &&
    s.transferAmount === 0 &&
    s.destinationSystemId === null &&
    !s.exportAllUnused &&
    !s.isCapital &&
    s.alnLinkedSystemId === null
  );
}

export function encodeDnaV2Binary(plan: DnaPlanData): string {
  if (plan.name.length === 0 || plan.name.length > MAX_PLAN_NAME || !NAME_REGEX.test(plan.name)) {
    throw new Error('Invalid plan name');
  }
  const w = new Writer();
  w.u8(VERSION);
  w.u8(FLAG_INCLUDE_SCOPES | FLAG_INCLUDE_CAPITALS);
  const nameBytes = Buffer.from(plan.name, 'utf8');
  w.varint(nameBytes.length);
  w.bytes(nameBytes);

  const meaningful = plan.systems.filter((s) => !isDefaultSystem(s));
  w.varint(meaningful.length);
  for (const s of meaningful) {
    w.varint(s.systemId);
    const stateMask = maskFromUpgradeNames(s.upgrades);
    w.u32(stateMask);

    let statusByte = STATUS_TO_CODE[s.status] & 0x03;
    if (s.exportAllUnused) statusByte |= 1 << STATUS_BIT_EXPORT_ALL;
    const hasDest = s.destinationSystemId !== null && s.destinationSystemId > 0;
    const hasTransfer = s.transferAmount > 0;
    if (hasDest) statusByte |= 1 << STATUS_BIT_HAS_DEST;
    if (hasTransfer) statusByte |= 1 << STATUS_BIT_HAS_TRANSFER;
    if (s.isCapital) statusByte |= 1 << STATUS_BIT_IS_CAPITAL;
    const hasAln = s.alnLinkedSystemId !== null && s.alnLinkedSystemId > 0;
    if (hasAln) statusByte |= 1 << STATUS_BIT_HAS_ALN;
    w.u8(statusByte);

    if (hasTransfer) w.varint(s.transferAmount);
    if (hasDest) w.varint(s.destinationSystemId as number);
    if (hasAln) w.varint(s.alnLinkedSystemId as number);
  }

  w.varint(plan.scopes.length);
  for (const sc of plan.scopes) {
    w.u8(SCOPE_CODE[sc.scopeType]);
    w.varint(sc.scopeId);
  }

  const compressed = deflateRawSync(w.toBuffer());
  return 'ESOV2B' + base64UrlEncode(compressed);
}

export function decodeDnaV2Binary(dna: string): ValidatedDna {
  if (!dna.startsWith('ESOV2B')) throw new Error('Not an ESOV2B DNA string.');
  const body = dna.slice(6);
  if (body.length === 0) throw new Error('Empty DNA payload.');
  let raw: Buffer;
  try {
    raw = inflateRawSync(base64UrlDecode(body), { maxOutputLength: MAX_BINARY_PAYLOAD });
  } catch (err) {
    throw new Error('DNA decompression failed: ' + (err as Error).message);
  }
  if (raw.length > MAX_BINARY_PAYLOAD) throw new Error('Decoded payload exceeds size limit.');

  const r = new Reader(raw);
  const version = r.u8();
  if (version !== VERSION) throw new Error(`Unsupported DNA version ${version}.`);
  const flags = r.u8();
  const includeScopes = (flags & FLAG_INCLUDE_SCOPES) !== 0;

  const nameLen = r.varint();
  if (nameLen === 0 || nameLen > MAX_PLAN_NAME * 4) throw new Error('Invalid plan name length.');
  const name = r.bytes(nameLen).toString('utf8');
  if (name.length === 0 || name.length > MAX_PLAN_NAME || !NAME_REGEX.test(name)) {
    throw new Error('Invalid plan name.');
  }

  const systemCount = r.varint();
  if (systemCount > MAX_SYSTEMS) throw new Error('Too many systems.');

  const upgrades: ValidatedDna['upgrades'] = [];
  const systemStatus: ValidatedDna['systemStatus'] = [];
  const capitalSystems: number[] = [];
  const alnLinks: ValidatedDna['alnLinks'] = [];
  const seenSystemIds = new Set<number>();

  for (let i = 0; i < systemCount; i++) {
    const systemId = r.varint();
    if (seenSystemIds.has(systemId)) {
      throw new Error(`Duplicate system entry ${systemId}.`);
    }
    seenSystemIds.add(systemId);
    const stateMask = r.u32();
    const statusByte = r.u8();
    const statusCode = statusByte & 0x03;
    const exportAllUnused = (statusByte >>> STATUS_BIT_EXPORT_ALL) & 1;
    const hasDest = (statusByte >>> STATUS_BIT_HAS_DEST) & 1;
    const hasTransfer = (statusByte >>> STATUS_BIT_HAS_TRANSFER) & 1;
    const isCapital = (statusByte >>> STATUS_BIT_IS_CAPITAL) & 1;
    const hasAln = (statusByte >>> STATUS_BIT_HAS_ALN) & 1;
    const reserved = (statusByte >>> 7) & 1;
    if (reserved !== 0) throw new Error('Reserved status bit set.');

    const transferAmount = hasTransfer ? r.varint() : 0;
    if (transferAmount > MAX_TRANSFER) throw new Error('Transfer amount out of range.');
    const destinationSystemId = hasDest ? r.varint() : null;
    const alnLinkedSystemId = hasAln ? r.varint() : null;

    const names = upgradeNamesFromMask(stateMask);
    names.forEach((upgradeName, ordering) => {
      upgrades.push({ systemId, upgradeName, installed: 1, ordering });
    });

    systemStatus.push({
      systemId,
      status: STATUS_BY_CODE[statusCode],
      transferAmount,
      destinationSystemId,
      exportAllUnused: exportAllUnused as 0 | 1
    });

    if (isCapital) capitalSystems.push(systemId);
    if (hasAln && alnLinkedSystemId !== null) {
      alnLinks.push({ systemId, linkedSystemId: alnLinkedSystemId, linkedSystemName: '' });
    }
  }

  const scopes: ValidatedDna['scopes'] = [];
  if (includeScopes && r.remaining() > 0) {
    const scopeCount = r.varint();
    if (scopeCount > MAX_SCOPES) throw new Error('Too many scopes.');
    for (let i = 0; i < scopeCount; i++) {
      const code = r.u8();
      if (code > 2) throw new Error('Invalid scope type code.');
      const scopeId = r.varint();
      scopes.push({ scopeType: SCOPE_TYPE_BY_CODE[code], scopeId });
    }
  }

  return { name, scopes, upgrades, systemStatus, capitalSystems, alnLinks };
}

// ---- Text codec ----

export function encodeDnaV2Text(plan: DnaPlanData): string {
  if (plan.name.length === 0 || plan.name.length > MAX_PLAN_NAME || !NAME_REGEX.test(plan.name)) {
    throw new Error('Invalid plan name');
  }
  const lines: string[] = [];
  lines.push(`ESOV2T v=${VERSION}`);
  lines.push(`n=${plan.name}`);
  for (const sc of plan.scopes) {
    lines.push(`scope=${sc.scopeType} ${sc.scopeId}`);
  }
  for (const s of plan.systems) {
    if (isDefaultSystem(s)) continue;
    lines.push(`sys ${s.systemId}`);
    const slotEntries = unpackState(maskFromUpgradeNames(s.upgrades));
    for (const { slot, value } of slotEntries) {
      const def = SLOT_DEFS[slot];
      lines.push(def.maxValue === 1 ? `  up=${slot}` : `  up=${slot}=${value}`);
    }
    const statusParts: string[] = [`status=${s.status}`];
    if (s.transferAmount > 0) statusParts.push(`amt=${s.transferAmount}`);
    if (s.destinationSystemId !== null && s.destinationSystemId > 0) {
      statusParts.push(`dest=${s.destinationSystemId}`);
    }
    if (s.exportAllUnused) statusParts.push('all=1');
    lines.push('  ' + statusParts.join(' '));
    if (s.isCapital) lines.push('  cap');
    if (s.alnLinkedSystemId !== null && s.alnLinkedSystemId > 0) {
      lines.push(`  aln=${s.alnLinkedSystemId}`);
    }
  }
  return lines.join('\n');
}

export function decodeDnaV2Text(dna: string): ValidatedDna {
  if (!dna.startsWith('ESOV2T')) throw new Error('Not an ESOV2T DNA string.');
  if (dna.length > MAX_TEXT_LENGTH) throw new Error('Text DNA exceeds size limit.');

  const rawLines = dna.split(/\r?\n/);
  const header = rawLines[0].trim();
  const headerMatch = header.match(/^ESOV2T\s+v=(\d+)$/);
  if (!headerMatch) throw new Error('Invalid ESOV2T header.');
  if (parseInt(headerMatch[1], 10) !== VERSION) throw new Error('Unsupported text DNA version.');

  let name: string | null = null;
  const scopes: ValidatedDna['scopes'] = [];
  const upgrades: ValidatedDna['upgrades'] = [];
  const systemStatus: ValidatedDna['systemStatus'] = [];
  const capitalSystems: number[] = [];
  const alnLinks: ValidatedDna['alnLinks'] = [];

  let currentSystemId: number | null = null;
  let currentSlots: Partial<Record<SlotName, number>> = {};
  let currentStatus: ValidatedDna['systemStatus'][number] | null = null;
  let currentCapital = false;
  let currentAln: number | null = null;

  const flushSystem = (): void => {
    if (currentSystemId === null) return;
    const names = upgradeNamesFromMask(packState(currentSlots));
    names.forEach((upgradeName, ordering) => {
      upgrades.push({ systemId: currentSystemId as number, upgradeName, installed: 1, ordering });
    });
    if (currentStatus) {
      systemStatus.push(currentStatus);
    } else {
      systemStatus.push({
        systemId: currentSystemId,
        status: 'local',
        transferAmount: 0,
        destinationSystemId: null,
        exportAllUnused: 0
      });
    }
    if (currentCapital) capitalSystems.push(currentSystemId);
    if (currentAln !== null) {
      alnLinks.push({ systemId: currentSystemId, linkedSystemId: currentAln, linkedSystemName: '' });
    }
    currentSystemId = null;
    currentSlots = {};
    currentStatus = null;
    currentCapital = false;
    currentAln = null;
  };

  for (let li = 1; li < rawLines.length; li++) {
    const raw = rawLines[li];
    const hashIdx = raw.indexOf('#');
    const line = (hashIdx >= 0 ? raw.slice(0, hashIdx) : raw).trim();
    if (line === '') continue;

    if (line.startsWith('n=')) {
      if (name !== null) throw new Error('Duplicate name line.');
      name = line.slice(2);
      if (name.length === 0 || name.length > MAX_PLAN_NAME || !NAME_REGEX.test(name)) {
        throw new Error('Invalid plan name.');
      }
      continue;
    }

    if (line.startsWith('scope=')) {
      if (currentSystemId !== null) throw new Error('Scope line after sys block.');
      const m = line.match(/^scope=(region|constellation|system)\s+(\d+)$/);
      if (!m) throw new Error(`Invalid scope line: ${line}`);
      scopes.push({ scopeType: m[1] as 'region' | 'constellation' | 'system', scopeId: parseInt(m[2], 10) });
      if (scopes.length > MAX_SCOPES) throw new Error('Too many scopes.');
      continue;
    }

    if (line.startsWith('sys ')) {
      flushSystem();
      const m = line.match(/^sys\s+(\d+)$/);
      if (!m) throw new Error(`Invalid sys line: ${line}`);
      currentSystemId = parseInt(m[1], 10);
      continue;
    }

    if (currentSystemId === null) {
      throw new Error(`Unexpected directive outside system block: ${line}`);
    }

    if (line.startsWith('up=')) {
      const body = line.slice(3);
      const eq = body.indexOf('=');
      let slotKey: string;
      let valueRaw: string | null;
      if (eq < 0) {
        slotKey = body;
        valueRaw = null;
      } else {
        slotKey = body.slice(0, eq);
        valueRaw = body.slice(eq + 1);
      }
      if (!(SLOT_NAMES as readonly string[]).includes(slotKey)) {
        throw new Error(`Unknown upgrade slot "${slotKey}".`);
      }
      const slot = slotKey as SlotName;
      const def = SLOT_DEFS[slot];
      let value: number;
      if (def.maxValue === 1) {
        value = 1;
      } else if (slot === 'stability' && valueRaw !== null && /[A-Za-z]/.test(valueRaw)) {
        const map: Record<string, number> = { Electric: 1, Exotic: 2, Gamma: 3, Plasma: 4 };
        value = map[valueRaw] ?? 0;
        if (value === 0) throw new Error(`Unknown stability variant "${valueRaw}".`);
      } else {
        if (valueRaw === null) throw new Error(`Slot "${slot}" requires a value.`);
        value = parseInt(valueRaw, 10);
        if (!Number.isInteger(value) || value < 1 || value > def.maxValue) {
          throw new Error(`Slot "${slot}" value "${valueRaw}" out of range.`);
        }
      }
      if (currentSlots[slot] !== undefined) throw new Error(`Duplicate slot "${slot}".`);
      currentSlots[slot] = value;
      continue;
    }

    if (line.startsWith('status=')) {
      if (currentStatus) throw new Error('Duplicate status line.');
      const tokens = line.split(/\s+/);
      let status: 'local' | 'import' | 'export' | 'transit' = 'local';
      let transferAmount = 0;
      let destinationSystemId: number | null = null;
      let exportAllUnused: 0 | 1 = 0;
      for (const tok of tokens) {
        if (tok.startsWith('status=')) {
          const v = tok.slice('status='.length);
          if (!(STATUS_BY_CODE as readonly string[]).includes(v)) {
            throw new Error(`Invalid status "${v}".`);
          }
          status = v as 'local' | 'import' | 'export' | 'transit';
        } else if (tok.startsWith('amt=')) {
          transferAmount = parseInt(tok.slice(4), 10);
          if (!Number.isInteger(transferAmount) || transferAmount < 0 || transferAmount > MAX_TRANSFER) {
            throw new Error('Invalid transfer amount.');
          }
        } else if (tok.startsWith('dest=')) {
          destinationSystemId = parseInt(tok.slice(5), 10);
          if (!Number.isInteger(destinationSystemId) || destinationSystemId < 1) {
            throw new Error('Invalid destination system id.');
          }
        } else if (tok === 'all=1') {
          exportAllUnused = 1;
        } else if (tok === 'all=0') {
          exportAllUnused = 0;
        } else {
          throw new Error(`Unknown status token "${tok}".`);
        }
      }
      currentStatus = {
        systemId: currentSystemId,
        status,
        transferAmount,
        destinationSystemId,
        exportAllUnused
      };
      continue;
    }

    if (line === 'cap') {
      currentCapital = true;
      continue;
    }

    if (line.startsWith('aln=')) {
      const linkedId = parseInt(line.slice(4), 10);
      if (!Number.isInteger(linkedId) || linkedId < 1) throw new Error('Invalid aln target.');
      currentAln = linkedId;
      continue;
    }

    throw new Error(`Unknown directive: ${line}`);
  }

  flushSystem();

  if (name === null) throw new Error('Missing name line.');
  return { name, scopes, upgrades, systemStatus, capitalSystems, alnLinks };
}

// Sanity check at module load: every named upgrade roundtrips through its slot.
for (const [name, m] of Object.entries(NAME_TO_SLOT)) {
  const back = SLOT_TO_NAME.get(`${m.slot}:${m.value}`);
  if (back !== name) {
    throw new Error(`Upgrade slot table inconsistency at "${name}".`);
  }
}
