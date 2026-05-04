import { ipcMain, dialog, BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { getDb } from '../db/userDb.js';
import { oreRTier } from './moonScans.js';
import {
  encodeDnaV2Binary,
  encodeDnaV2Text,
  decodeDnaV2Binary,
  decodeDnaV2Text,
  type DnaPlanData,
  type DnaSystemEntry,
  type ValidatedDna as ValidatedDnaV2
} from '../data/dnaCodec.js';

const NAME_REGEX = /^[\w\s\-_.()]+$/;
const MAX_DNA_LENGTH = 256 * 1024;
const MAX_JSON_LENGTH = 1024 * 1024;
const MAX_SCOPES = 1000;
const MAX_UPGRADES = 10_000;
const MAX_TRANSFER = 1_000_000_000;

const SCOPE_TYPE_BY_CODE = ['region', 'constellation', 'system'] as const;
const STATUS_BY_CODE = ['local', 'import', 'export', 'transit'] as const;

function broadcastPlanChanged(planId: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('plan-changed', { planId });
  }
}

function isInt(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

type ValidatedDna = ValidatedDnaV2;

function buildPlanDataForExport(
  planId: number
): { plan: { id: number; name: string }; data: DnaPlanData } {
  const db = getDb();
  const plan = db.prepare('SELECT id, name FROM plans WHERE id = ?').get(planId) as
    | { id: number; name: string }
    | undefined;
  if (!plan) throw new Error('Plan not found');

  const scopeRows = db
    .prepare('SELECT scope_type, scope_id FROM plan_scopes WHERE plan_id = ?')
    .all(planId) as Array<{ scope_type: 'region' | 'constellation' | 'system'; scope_id: number }>;

  const upgradeRows = db
    .prepare(
      `SELECT system_id, upgrade_name, ordering
       FROM plan_upgrades WHERE plan_id = ? ORDER BY system_id, ordering`
    )
    .all(planId) as Array<{ system_id: number; upgrade_name: string; ordering: number }>;

  const statusRows = db
    .prepare(
      `SELECT system_id, status, transfer_amount, destination_system_id, export_all_unused
       FROM plan_system_status WHERE plan_id = ?`
    )
    .all(planId) as Array<{
    system_id: number;
    status: 'local' | 'import' | 'export' | 'transit';
    transfer_amount: number;
    destination_system_id: number | null;
    export_all_unused: number;
  }>;

  const capRows = db
    .prepare('SELECT system_id FROM plan_capital_systems WHERE plan_id = ?')
    .all(planId) as Array<{ system_id: number }>;
  const capitalSet = new Set(capRows.map((r) => r.system_id));

  const alnRows = db
    .prepare(
      'SELECT system_id, linked_system_id FROM plan_aln_links WHERE plan_id = ? AND linked_system_id IS NOT NULL'
    )
    .all(planId) as Array<{ system_id: number; linked_system_id: number }>;
  const alnMap = new Map<number, number>();
  for (const r of alnRows) alnMap.set(r.system_id, r.linked_system_id);

  const systemEntries = new Map<number, DnaSystemEntry>();
  const ensure = (systemId: number): DnaSystemEntry => {
    let entry = systemEntries.get(systemId);
    if (!entry) {
      entry = {
        systemId,
        upgrades: [],
        status: 'local',
        transferAmount: 0,
        destinationSystemId: null,
        exportAllUnused: false,
        isCapital: false,
        alnLinkedSystemId: null
      };
      systemEntries.set(systemId, entry);
    }
    return entry;
  };

  for (const row of upgradeRows) {
    ensure(row.system_id).upgrades.push(row.upgrade_name);
  }
  for (const row of statusRows) {
    const e = ensure(row.system_id);
    e.status = row.status;
    e.transferAmount = row.transfer_amount;
    e.destinationSystemId = row.destination_system_id;
    e.exportAllUnused = row.export_all_unused !== 0;
  }
  for (const id of capitalSet) ensure(id).isCapital = true;
  for (const [systemId, linkedId] of alnMap) ensure(systemId).alnLinkedSystemId = linkedId;

  const data: DnaPlanData = {
    name: plan.name,
    scopes: scopeRows.map((r) => ({ scopeType: r.scope_type, scopeId: r.scope_id })),
    systems: Array.from(systemEntries.values()).sort((a, b) => a.systemId - b.systemId)
  };
  return { plan, data };
}

export interface CapturePngMeta {
  planId?: number | null;
  planName?: string;
  panel?: string;
  systemName?: string;
  opsecPreset?: string;
}

export interface CapturePngResult {
  saved: boolean;
  path?: string;
  logId?: number;
}

export interface ExportLogEntry {
  id: number;
  planId: number | null;
  planName: string;
  exportType: string;
  panel: string | null;
  systemName: string | null;
  filename: string | null;
  opsecPreset: string | null;
  exportedAt: string;
}

function logExport(row: {
  planId: number | null;
  planName: string;
  exportType: string;
  panel: string | null;
  systemName: string | null;
  filename: string | null;
  opsecPreset: string | null;
}): number {
  const result = getDb()
    .prepare(
      `INSERT INTO export_log
         (plan_id, plan_name, export_type, panel, system_name, filename, opsec_preset, exported_at)
       VALUES (@planId, @planName, @exportType, @panel, @systemName, @filename, @opsecPreset, @exportedAt)`
    )
    .run({ ...row, exportedAt: new Date().toISOString() });
  return Number(result.lastInsertRowid);
}

export function registerExportsIpc(): void {
  ipcMain.handle(
    'exports.capturePng',
    async (
      event,
      filename: string,
      dataUrl: string,
      meta?: CapturePngMeta
    ): Promise<CapturePngResult> => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const result = await dialog.showSaveDialog(win!, {
        title: 'Export PNG',
        defaultPath: filename,
        filters: [{ name: 'PNG image', extensions: ['png'] }]
      });
      if (result.canceled || !result.filePath) return { saved: false };

      const filePath = path.extname(result.filePath).toLowerCase() === '.png'
        ? result.filePath
        : result.filePath + '.png';

      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      await writeFile(filePath, Buffer.from(base64, 'base64'));

      let logId: number | undefined;
      if (meta?.planName) {
        logId = logExport({
          planId: meta.planId ?? null,
          planName: meta.planName,
          exportType: meta.panel ? `png-${meta.panel}` : 'png',
          panel: meta.panel ?? null,
          systemName: meta.systemName ?? null,
          filename: filePath,
          opsecPreset: meta.opsecPreset ?? null
        });
      }
      return { saved: true, path: filePath, logId };
    }
  );

  ipcMain.handle(
    'exports.captureSvg',
    async (
      event,
      filename: string,
      svgContent: string,
      meta?: CapturePngMeta
    ): Promise<CapturePngResult> => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const result = await dialog.showSaveDialog(win!, {
        title: 'Export SVG',
        defaultPath: filename,
        filters: [{ name: 'SVG image', extensions: ['svg'] }]
      });
      if (result.canceled || !result.filePath) return { saved: false };

      const filePath = path.extname(result.filePath).toLowerCase() === '.svg'
        ? result.filePath
        : result.filePath + '.svg';

      await writeFile(filePath, svgContent, 'utf8');

      let logId: number | undefined;
      if (meta?.planName) {
        logId = logExport({
          planId: meta.planId ?? null,
          planName: meta.planName,
          exportType: meta.panel ? `svg-${meta.panel}` : 'svg',
          panel: meta.panel ?? null,
          systemName: meta.systemName ?? null,
          filename: filePath,
          opsecPreset: meta.opsecPreset ?? null
        });
      }
      return { saved: true, path: filePath, logId };
    }
  );

  ipcMain.handle('exports.list', (_, planId: number | null): ExportLogEntry[] => {
    const rows = (planId == null
      ? getDb()
          .prepare(
            `SELECT id, plan_id, plan_name, export_type, panel, system_name,
                    filename, opsec_preset, exported_at
             FROM export_log ORDER BY exported_at DESC LIMIT 500`
          )
          .all()
      : getDb()
          .prepare(
            `SELECT id, plan_id, plan_name, export_type, panel, system_name,
                    filename, opsec_preset, exported_at
             FROM export_log WHERE plan_id = ? ORDER BY exported_at DESC LIMIT 500`
          )
          .all(planId)) as Array<{
      id: number;
      plan_id: number | null;
      plan_name: string;
      export_type: string;
      panel: string | null;
      system_name: string | null;
      filename: string | null;
      opsec_preset: string | null;
      exported_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      planId: r.plan_id,
      planName: r.plan_name,
      exportType: r.export_type,
      panel: r.panel,
      systemName: r.system_name,
      filename: r.filename,
      opsecPreset: r.opsec_preset,
      exportedAt: r.exported_at
    }));
  });

  ipcMain.handle('exports.deleteLog', (_, id: number): void => {
    getDb().prepare('DELETE FROM export_log WHERE id = ?').run(id);
  });

  ipcMain.handle('exports.getConfig', (): Record<string, string> => {
    const rows = getDb()
      .prepare('SELECT key, value FROM export_config')
      .all() as Array<{ key: string; value: string }>;
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  });

  ipcMain.handle('exports.setConfig', (_, key: string, value: string): void => {
    getDb()
      .prepare(
        `INSERT INTO export_config (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value);
  });

  ipcMain.handle('exports.exportDna', (_, planId: number): { dna: string } => {
    const { plan, data } = buildPlanDataForExport(planId);
    const dna = encodeDnaV2Binary(data);
    logExport({
      planId: plan.id,
      planName: plan.name,
      exportType: 'dna-export',
      panel: null,
      systemName: null,
      filename: null,
      opsecPreset: null
    });
    return { dna };
  });

  ipcMain.handle('exports.exportDnaText', (_, planId: number): { dna: string } => {
    const { plan, data } = buildPlanDataForExport(planId);
    const dna = encodeDnaV2Text(data);
    logExport({
      planId: plan.id,
      planName: plan.name,
      exportType: 'dna-export-text',
      panel: null,
      systemName: null,
      filename: null,
      opsecPreset: null
    });
    return { dna };
  });

  ipcMain.handle(
    'exports.importDna',
    (_, dna: unknown): { planId: number; name: string } => {
      if (typeof dna !== 'string') throw new Error('DNA must be a string.');
      if (dna.length > MAX_DNA_LENGTH) throw new Error('DNA payload exceeds size limit.');

      let validated: ValidatedDna;
      if (dna.startsWith('ESOV2B')) {
        validated = decodeDnaV2Binary(dna);
      } else if (dna.startsWith('ESOV2T')) {
        validated = decodeDnaV2Text(dna);
      } else if (dna.startsWith('ESOV1')) {
        let json: string;
        try {
          json = Buffer.from(dna.slice(5), 'base64').toString('utf8');
        } catch {
          throw new Error('DNA base64 decode failed.');
        }
        if (json.length > MAX_JSON_LENGTH) throw new Error('Decoded payload exceeds size limit.');
        let raw: unknown;
        try {
          raw = JSON.parse(json);
        } catch {
          throw new Error('DNA JSON parse failed.');
        }
        validated = validateDnaPayloadV1(raw);
      } else {
        throw new Error('Unrecognised DNA prefix (expected ESOV1, ESOV2B, or ESOV2T).');
      }

      const db = getDb();
      const result = db.transaction((): { planId: number; name: string } => {
        const exists = (table: string, id: number): boolean =>
          Boolean(db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id));

        for (const scope of validated.scopes) {
          const ok =
            (scope.scopeType === 'region' && exists('regions', scope.scopeId)) ||
            (scope.scopeType === 'constellation' && exists('constellations', scope.scopeId)) ||
            (scope.scopeType === 'system' && exists('systems', scope.scopeId));
          if (!ok) {
            throw new Error(
              `Scope ${scope.scopeType}/${scope.scopeId} not found in local seed.`
            );
          }
        }

        const upgradeNameSet = new Set(
          (db.prepare('SELECT name FROM upgrades').all() as Array<{ name: string }>).map(
            (r) => r.name
          )
        );
        for (const u of validated.upgrades) {
          if (!exists('systems', u.systemId)) {
            throw new Error(`Upgrade references unknown system ${u.systemId}.`);
          }
          if (!upgradeNameSet.has(u.upgradeName)) {
            throw new Error(`Unknown upgrade "${u.upgradeName}".`);
          }
        }
        for (const s of validated.systemStatus) {
          if (!exists('systems', s.systemId)) {
            throw new Error(`System status references unknown system ${s.systemId}.`);
          }
          if (s.destinationSystemId !== null && !exists('systems', s.destinationSystemId)) {
            throw new Error(
              `System status destination ${s.destinationSystemId} not found.`
            );
          }
        }
        for (const id of validated.capitalSystems) {
          if (!exists('systems', id)) {
            throw new Error(`Capital system ${id} not found.`);
          }
        }
        for (const a of validated.alnLinks) {
          if (!exists('systems', a.systemId) || !exists('systems', a.linkedSystemId)) {
            throw new Error('ALN link references unknown system.');
          }
          const row = db
            .prepare('SELECT name FROM systems WHERE id = ?')
            .get(a.linkedSystemId) as { name: string } | undefined;
          if (row) a.linkedSystemName = row.name;
        }

        let name = validated.name;
        let suffix = 0;
        while (
          db.prepare('SELECT 1 FROM plans WHERE name = ?').get(name) !== undefined
        ) {
          suffix += 1;
          name = `${validated.name} (imported${suffix > 1 ? ' ' + suffix : ''})`;
          if (suffix > 100) throw new Error('Could not find a free plan name.');
        }

        const now = new Date().toISOString();
        const planResult = db
          .prepare(
            'INSERT INTO plans (name, created_at, updated_at) VALUES (?, ?, ?)'
          )
          .run(name, now, now);
        const planId = Number(planResult.lastInsertRowid);

        const insertScope = db.prepare(
          'INSERT INTO plan_scopes (plan_id, scope_type, scope_id) VALUES (?, ?, ?)'
        );
        for (const sc of validated.scopes) {
          insertScope.run(planId, sc.scopeType, sc.scopeId);
        }

        const insertUpgrade = db.prepare(
          `INSERT INTO plan_upgrades (plan_id, system_id, upgrade_name, ordering, installed)
           VALUES (?, ?, ?, ?, ?)`
        );
        for (const u of validated.upgrades) {
          insertUpgrade.run(planId, u.systemId, u.upgradeName, u.ordering, u.installed);
        }

        const insertStatus = db.prepare(
          `INSERT INTO plan_system_status
             (plan_id, system_id, status, transfer_amount, destination_system_id, export_all_unused)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        for (const s of validated.systemStatus) {
          insertStatus.run(
            planId,
            s.systemId,
            s.status,
            s.transferAmount,
            s.destinationSystemId,
            s.exportAllUnused
          );
        }

        const insertCap = db.prepare(
          'INSERT INTO plan_capital_systems (plan_id, system_id) VALUES (?, ?)'
        );
        for (const id of validated.capitalSystems) {
          insertCap.run(planId, id);
        }

        const insertAln = db.prepare(
          `INSERT INTO plan_aln_links
             (plan_id, system_id, linked_system_id, linked_system_name)
           VALUES (?, ?, ?, ?)`
        );
        for (const a of validated.alnLinks) {
          insertAln.run(planId, a.systemId, a.linkedSystemId, a.linkedSystemName);
        }

        logExport({
          planId,
          planName: name,
          exportType: 'dna-import',
          panel: null,
          systemName: null,
          filename: null,
          opsecPreset: null
        });

        return { planId, name };
      })();

      broadcastPlanChanged(result.planId);
      return result;
    }
  );

  // Moon scan export: serialise all moon_scans rows for systems in the plan's scope.
  // Format: 'ESOVMS1' + base64(JSON)
  ipcMain.handle('exports.exportMoonScans', (_, planId: number): { data: string } => {
    const db = getDb();

    type ScopeRow = { system_id: number };
    const planSystemIds = (db.prepare(`
      SELECT DISTINCT s.id AS system_id
      FROM plan_scopes sc
      JOIN systems s ON (
        (sc.scope_type = 'system'        AND sc.scope_id = s.id) OR
        (sc.scope_type = 'constellation' AND sc.scope_id = s.constellation_id) OR
        (sc.scope_type = 'region'        AND sc.scope_id = s.region_id)
      )
      WHERE sc.plan_id = ?
      UNION
      SELECT DISTINCT pu.system_id
      FROM plan_upgrades pu WHERE pu.plan_id = ?
      UNION
      SELECT DISTINCT ps.system_id
      FROM plan_structures ps WHERE ps.plan_id = ?
    `).all(planId, planId, planId) as ScopeRow[]).map((r) => r.system_id);

    if (planSystemIds.length === 0) return { data: 'ESOVMS1' + Buffer.from('[]', 'utf8').toString('base64') };

    const placeholders = planSystemIds.map(() => '?').join(',');
    type MoonRow = { system_id: number; moon_number: number; ore_type: string; ore_percent: number };
    const rows = db.prepare(`
      SELECT system_id, moon_number, ore_type, ore_percent
      FROM moon_scans WHERE system_id IN (${placeholders})
      ORDER BY system_id, moon_number, ore_type
    `).all(...planSystemIds) as MoonRow[];

    // Compact representation: array of [system_id, moon_number, ore_type, ore_percent]
    const payload = rows.map((r) => [r.system_id, r.moon_number, r.ore_type, r.ore_percent]);
    const compressed = deflateRawSync(Buffer.from(JSON.stringify(payload), 'utf8'));
    const data = 'ESOVMS1' + compressed.toString('base64');
    return { data };
  });

  // Moon scan import: parse ESOVMS1 payload and upsert into moon_scans.
  // Creates a new import session for the batch.
  ipcMain.handle('exports.importMoonScans', (_, raw: unknown): { systemCount: number; moonsImported: number } => {
    if (typeof raw !== 'string') throw new Error('Moon scan data must be a string.');
    if (!raw.startsWith('ESOVMS1')) throw new Error('Not a recognised moon scan export (expected ESOVMS1).');

    let payload: unknown;
    try {
      const decompressed = inflateRawSync(Buffer.from(raw.slice(7), 'base64'), { maxOutputLength: 10 * 1024 * 1024 });
      payload = JSON.parse(decompressed.toString('utf8'));
    } catch {
      throw new Error('Moon scan data decode failed.');
    }
    if (!Array.isArray(payload)) throw new Error('Invalid moon scan payload.');
    if (payload.length > 100_000) throw new Error('Moon scan payload too large.');

    const db = getDb();

    type Entry = [number, number, string, number];
    const entries: Entry[] = [];
    for (const item of payload) {
      if (!Array.isArray(item) || item.length !== 4) throw new Error('Invalid moon scan row.');
      const [systemId, moonNumber, oreType, orePercent] = item;
      if (!Number.isInteger(systemId) || systemId < 1) throw new Error('Invalid system_id in moon scan.');
      if (!Number.isInteger(moonNumber) || moonNumber < 1) throw new Error('Invalid moon_number.');
      if (typeof oreType !== 'string' || oreType.length === 0 || oreType.length > 100) throw new Error('Invalid ore_type.');
      if (typeof orePercent !== 'number' || orePercent < 0 || orePercent > 1) throw new Error('Invalid ore_percent.');
      if (oreRTier(oreType) === null) throw new Error(`Unknown ore type "${oreType}".`);
      if (!db.prepare('SELECT 1 FROM systems WHERE id = ?').get(systemId)) {
        throw new Error(`System ${systemId} not found in local SDE.`);
      }
      entries.push([systemId, moonNumber, oreType, orePercent]);
    }

    const systemCount = new Set(entries.map(([sid]) => sid)).size;
    const now = new Date().toISOString();

    const upsert = db.prepare(`
      INSERT INTO moon_scans (session_id, system_id, moon_number, ore_type, ore_percent)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(system_id, moon_number, ore_type) DO UPDATE SET
        session_id  = excluded.session_id,
        ore_percent = excluded.ore_percent
    `);
    const insertSession = db.prepare(
      'INSERT INTO moon_scan_sessions (imported_at, system_count) VALUES (?, ?)'
    );

    db.transaction(() => {
      const sessionId = Number(insertSession.run(now, systemCount).lastInsertRowid);
      for (const [systemId, moonNumber, oreType, orePercent] of entries) {
        upsert.run(sessionId, systemId, moonNumber, oreType, orePercent);
      }
    })();

    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('data-refreshed');
    }

    return { systemCount, moonsImported: entries.length };
  });
}

function validateDnaPayloadV1(raw: unknown): ValidatedDna {
  if (!raw || typeof raw !== 'object') throw new Error('Payload is not an object.');
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) throw new Error('Unsupported DNA version.');
  if (typeof o.n !== 'string' || o.n.length === 0 || o.n.length > 64 || !NAME_REGEX.test(o.n)) {
    throw new Error('Invalid plan name.');
  }
  if (!Array.isArray(o.s) || o.s.length > MAX_SCOPES) throw new Error('Invalid scopes array.');
  if (!Array.isArray(o.u) || o.u.length > MAX_UPGRADES)
    throw new Error('Invalid upgrades array.');

  const scopes: ValidatedDna['scopes'] = [];
  for (const item of o.s as unknown[]) {
    if (!Array.isArray(item) || item.length !== 2) throw new Error('Invalid scope tuple.');
    const [code, id] = item;
    if (!isInt(code, 0, 2) || !isInt(id, 0)) throw new Error('Invalid scope tuple values.');
    scopes.push({ scopeType: SCOPE_TYPE_BY_CODE[code], scopeId: id });
  }

  const upgradeNameRegex = /^[\w\s\-./()]+$/;
  const upgrades: ValidatedDna['upgrades'] = [];
  for (const item of o.u as unknown[]) {
    if (!Array.isArray(item) || item.length !== 4) throw new Error('Invalid upgrade tuple.');
    const [sysId, name, installed, ordering] = item;
    if (!isInt(sysId, 0)) throw new Error('Invalid upgrade systemId.');
    if (typeof name !== 'string' || name.length === 0 || name.length > 100 || !upgradeNameRegex.test(name)) {
      throw new Error('Invalid upgrade name.');
    }
    if (installed !== 0 && installed !== 1) throw new Error('Invalid installed flag.');
    if (!isInt(ordering, 0)) throw new Error('Invalid ordering.');
    upgrades.push({
      systemId: sysId,
      upgradeName: name,
      installed: installed as 0 | 1,
      ordering
    });
  }

  const systemStatus: ValidatedDna['systemStatus'] = [];
  if (o.st !== undefined) {
    if (!Array.isArray(o.st)) throw new Error('Invalid systemStatus array.');
    for (const item of o.st as unknown[]) {
      if (!Array.isArray(item) || item.length !== 5) throw new Error('Invalid status tuple.');
      const [sysId, code, amount, dest, exportAll] = item;
      if (!isInt(sysId, 0)) throw new Error('Invalid status systemId.');
      if (!isInt(code, 0, 3)) throw new Error('Invalid status code.');
      if (!isInt(amount, 0, MAX_TRANSFER)) throw new Error('Invalid transfer amount.');
      if (!isInt(dest, 0)) throw new Error('Invalid destination systemId.');
      if (exportAll !== 0 && exportAll !== 1) throw new Error('Invalid exportAllUnused.');
      systemStatus.push({
        systemId: sysId,
        status: STATUS_BY_CODE[code],
        transferAmount: amount,
        destinationSystemId: dest === 0 ? null : dest,
        exportAllUnused: exportAll as 0 | 1
      });
    }
  }

  const capitalSystems: number[] = [];
  if (o.cap !== undefined) {
    if (!Array.isArray(o.cap)) throw new Error('Invalid capitalSystems array.');
    for (const item of o.cap as unknown[]) {
      if (!isInt(item, 0)) throw new Error('Invalid capital systemId.');
      capitalSystems.push(item);
    }
  }

  const alnLinks: ValidatedDna['alnLinks'] = [];
  if (o.aln !== undefined) {
    if (!Array.isArray(o.aln)) throw new Error('Invalid alnLinks array.');
    for (const item of o.aln as unknown[]) {
      if (!Array.isArray(item) || item.length !== 2) throw new Error('Invalid ALN tuple.');
      const [sysId, linkedId] = item;
      if (!isInt(sysId, 0) || !isInt(linkedId, 0)) throw new Error('Invalid ALN tuple values.');
      alnLinks.push({ systemId: sysId, linkedSystemId: linkedId, linkedSystemName: '' });
    }
  }

  return { name: o.n, scopes, upgrades, systemStatus, capitalSystems, alnLinks };
}
