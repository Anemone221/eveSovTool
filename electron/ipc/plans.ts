import { BrowserWindow, ipcMain } from 'electron';
import { getDb } from '../db/userDb.js';
import { findPath, reachableSystems } from './adjacency.js';
import { upgradeTypeKey, upgradeTypeLabel } from '@shared/upgradeTypes';
import type {
  AlnLink,
  AlnTarget,
  AssignResult,
  AuditFinding,
  ClearUpgradesScope,
  PlanAuditResult,
  PlanMatrix,
  PlanMatrixSystem,
  PlanRollup,
  PlanRollupRow,
  PlanScope,
  PlanSummary,
  PlanUpgradeRow,
  SetTransferResult,
  SystemBalance,
  SystemStatus,
  WorkforceTransfer
} from '@shared/index';

interface PlanDbRow {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  read_only: number;
}

interface ScopeDbRow {
  scope_type: 'region' | 'constellation' | 'system';
  scope_id: number;
}

interface PlanUpgradeDbRow {
  plan_id: number;
  system_id: number;
  upgrade_name: string;
  ordering: number;
  notes: string | null;
  installed: number;
}

interface BalanceDbRow {
  system_id: number;
  available_power: number;
  available_workforce: number;
  available_ice: number;
  available_gas: number;
  consumed_power: number;
  consumed_workforce: number;
  consumed_ice: number;
  consumed_gas: number;
  startup_fuel: number;
  status: SystemStatus;
}

interface RollupDbRow extends BalanceDbRow {
  system_name: string;
  constellation_id: number;
  constellation_name: string;
  region_id: number;
  region_name: string;
  security_status: number | null;
  upgrade_names: string | null;
  installed_count: number;
  total_count: number;
}

interface TransferDbRow {
  source_system_id: number;
  source_name: string;
  dest_system_id: number;
  dest_name: string | null;
  transfer_amount: number;
  export_all_unused: number;
}

const toPlanSummary = (r: PlanDbRow): PlanSummary => ({
  id: r.id,
  name: r.name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  readOnly: r.read_only === 1,
});

function assertWritable(db: ReturnType<typeof import('../db/userDb.js').getDb>, planId: number): void {
  const row = db.prepare('SELECT read_only FROM plans WHERE id = ?').get(planId) as { read_only: number } | undefined;
  if (row?.read_only === 1) throw new Error('Plan is read-only');
}

const toPlanUpgrade = (r: PlanUpgradeDbRow): PlanUpgradeRow => ({
  planId: r.plan_id,
  systemId: r.system_id,
  upgradeName: r.upgrade_name,
  ordering: r.ordering,
  notes: r.notes,
  installed: r.installed === 1
});

function balanceFromRow(r: BalanceDbRow): SystemBalance {
  const balanced =
    r.consumed_power <= r.available_power &&
    r.consumed_workforce <= r.available_workforce &&
    r.consumed_ice <= r.available_ice &&
    r.consumed_gas <= r.available_gas;
  return {
    systemId: r.system_id,
    availablePower: r.available_power,
    consumedPower: r.consumed_power,
    availableWorkforce: r.available_workforce,
    consumedWorkforce: r.consumed_workforce,
    availableIce: r.available_ice,
    consumedIce: r.consumed_ice,
    availableGas: r.available_gas,
    consumedGas: r.consumed_gas,
    startupFuel: r.startup_fuel,
    balanced,
    status: r.status
  };
}

function rollupFromRow(r: RollupDbRow, alnLink: AlnLink | null = null): PlanRollupRow {
  return {
    ...balanceFromRow(r),
    systemName: r.system_name,
    constellationId: r.constellation_id,
    constellationName: r.constellation_name,
    regionId: r.region_id,
    regionName: r.region_name,
    securityStatus: r.security_status,
    upgrades: r.upgrade_names ? r.upgrade_names.split(String.fromCharCode(31)) : [],
    installedCount: r.installed_count,
    totalCount: r.total_count,
    alnLink
  };
}

const BALANCE_SQL_BY_SYSTEM = `
  SELECT
    sb.system_id,
    sb.available_power,
    sb.available_workforce + COALESCE((
      SELECT SUM(
        CASE WHEN src.export_all_unused = 1
          THEN (
            SELECT CASE WHEN (sb2.available_workforce - COALESCE((
              SELECT SUM(u2.workforce) FROM plan_upgrades pu2
              JOIN upgrades u2 ON u2.name = pu2.upgrade_name
              WHERE pu2.plan_id = @planId AND pu2.system_id = src.system_id
            ), 0)) > 0
            THEN (sb2.available_workforce - COALESCE((
              SELECT SUM(u2.workforce) FROM plan_upgrades pu2
              JOIN upgrades u2 ON u2.name = pu2.upgrade_name
              WHERE pu2.plan_id = @planId AND pu2.system_id = src.system_id
            ), 0))
            ELSE 0 END
            FROM system_budget sb2 WHERE sb2.system_id = src.system_id
          )
          ELSE src.transfer_amount
        END
      )
      FROM plan_system_status src
      WHERE src.plan_id = @planId
        AND src.destination_system_id = sb.system_id
        AND src.status = 'export'
    ), 0) AS available_workforce,
    sb.available_ice, sb.available_gas,
    COALESCE(pss.status, 'local')        AS status,
    COALESCE(SUM(u.power), 0)            AS consumed_power,
    COALESCE(SUM(u.workforce), 0)
      + CASE
          WHEN pss.status = 'export' AND pss.export_all_unused = 1
            THEN CASE WHEN (sb.available_workforce - COALESCE(SUM(u.workforce), 0)) > 0
                      THEN (sb.available_workforce - COALESCE(SUM(u.workforce), 0))
                      ELSE 0 END
          WHEN pss.status = 'export'
            THEN COALESCE(pss.transfer_amount, 0)
          ELSE 0
        END                              AS consumed_workforce,
    COALESCE(SUM(u.superionic_ice), 0)   AS consumed_ice,
    COALESCE(SUM(u.magmatic_gas), 0)     AS consumed_gas,
    COALESCE(SUM(u.startup), 0)          AS startup_fuel
  FROM system_budget sb
  LEFT JOIN plan_upgrades pu
    ON pu.system_id = sb.system_id AND pu.plan_id = @planId
  LEFT JOIN upgrades u ON u.name = pu.upgrade_name
  LEFT JOIN plan_system_status pss
    ON pss.plan_id = @planId AND pss.system_id = sb.system_id
  WHERE sb.system_id = @systemId
  GROUP BY sb.system_id
`;

const BALANCE_SQL_FOR_PLAN = `
  WITH scope_systems AS (
    SELECT DISTINCT s.id AS system_id FROM systems s
    JOIN plan_scopes ps ON
      (ps.scope_type = 'system'        AND ps.scope_id = s.id)             OR
      (ps.scope_type = 'constellation' AND ps.scope_id = s.constellation_id) OR
      (ps.scope_type = 'region'        AND ps.scope_id = s.region_id)
    WHERE ps.plan_id = @planId
  ),
  upgrade_systems AS (
    SELECT DISTINCT system_id FROM plan_upgrades WHERE plan_id = @planId
  ),
  status_systems AS (
    SELECT DISTINCT system_id FROM plan_system_status WHERE plan_id = @planId
  ),
  active_systems AS (
    SELECT system_id FROM scope_systems
    UNION
    SELECT system_id FROM upgrade_systems
    UNION
    SELECT system_id FROM status_systems
  )
  SELECT
    sb.system_id,
    s.name        AS system_name,
    s.constellation_id, c.name AS constellation_name,
    s.region_id,  r.name AS region_name,
    s.security_status,
    COALESCE(pss.status, 'local')        AS status,
    sb.available_power,
    sb.available_workforce + COALESCE((
      SELECT SUM(
        CASE WHEN src.export_all_unused = 1
          THEN (
            SELECT CASE WHEN (sb2.available_workforce - COALESCE((
              SELECT SUM(u2.workforce) FROM plan_upgrades pu2
              JOIN upgrades u2 ON u2.name = pu2.upgrade_name
              WHERE pu2.plan_id = @planId AND pu2.system_id = src.system_id
            ), 0)) > 0
            THEN (sb2.available_workforce - COALESCE((
              SELECT SUM(u2.workforce) FROM plan_upgrades pu2
              JOIN upgrades u2 ON u2.name = pu2.upgrade_name
              WHERE pu2.plan_id = @planId AND pu2.system_id = src.system_id
            ), 0))
            ELSE 0 END
            FROM system_budget sb2 WHERE sb2.system_id = src.system_id
          )
          ELSE src.transfer_amount
        END
      )
      FROM plan_system_status src
      WHERE src.plan_id = @planId
        AND src.destination_system_id = sb.system_id
        AND src.status = 'export'
    ), 0) AS available_workforce,
    sb.available_ice, sb.available_gas,
    COALESCE(SUM(u.power), 0)            AS consumed_power,
    COALESCE(SUM(u.workforce), 0)
      + CASE
          WHEN pss.status = 'export' AND pss.export_all_unused = 1
            THEN CASE WHEN (sb.available_workforce - COALESCE(SUM(u.workforce), 0)) > 0
                      THEN (sb.available_workforce - COALESCE(SUM(u.workforce), 0))
                      ELSE 0 END
          WHEN pss.status = 'export'
            THEN COALESCE(pss.transfer_amount, 0)
          ELSE 0
        END                              AS consumed_workforce,
    COALESCE(SUM(u.superionic_ice), 0)   AS consumed_ice,
    COALESCE(SUM(u.magmatic_gas), 0)     AS consumed_gas,
    COALESCE(SUM(u.startup), 0)          AS startup_fuel,
    GROUP_CONCAT(pu.upgrade_name, CHAR(31)) AS upgrade_names,
    COALESCE(SUM(pu.installed), 0)        AS installed_count,
    COALESCE(SUM(CASE WHEN pu.upgrade_name IS NOT NULL THEN 1 ELSE 0 END), 0) AS total_count
  FROM active_systems acs
  JOIN system_budget sb     ON sb.system_id = acs.system_id
  JOIN systems s            ON s.id = sb.system_id
  JOIN constellations c     ON c.id = s.constellation_id
  JOIN regions r            ON r.id = s.region_id
  LEFT JOIN plan_upgrades pu
    ON pu.system_id = sb.system_id AND pu.plan_id = @planId
  LEFT JOIN upgrades u ON u.name = pu.upgrade_name
  LEFT JOIN plan_system_status pss
    ON pss.plan_id = @planId AND pss.system_id = sb.system_id
  GROUP BY sb.system_id
  ORDER BY r.name, c.name, s.name
`;

function broadcastPlanChanged(planId: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('plan-changed', { planId });
  }
}

export function registerPlansIpc(): void {
  ipcMain.handle('plans.list', (): PlanSummary[] => {
    return (
      getDb()
        .prepare('SELECT * FROM plans ORDER BY updated_at DESC')
        .all() as PlanDbRow[]
    ).map(toPlanSummary);
  });

  ipcMain.handle(
    'plans.get',
    (
      _,
      id: number
    ): {
      plan: PlanSummary;
      scopes: PlanScope[];
      upgrades: PlanUpgradeRow[];
      capitalSystemIds: number[];
    } | null => {
      const db = getDb();
      const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(id) as PlanDbRow | undefined;
      if (!plan) return null;
      const scopeRows = db
        .prepare('SELECT scope_type, scope_id FROM plan_scopes WHERE plan_id = ?')
        .all(id) as ScopeDbRow[];
      const upgradeRows = db
        .prepare('SELECT * FROM plan_upgrades WHERE plan_id = ? ORDER BY system_id, ordering, upgrade_name')
        .all(id) as PlanUpgradeDbRow[];
      const capitalRows = db
        .prepare('SELECT system_id FROM plan_capital_systems WHERE plan_id = ?')
        .all(id) as Array<{ system_id: number }>;
      return {
        plan: toPlanSummary(plan),
        scopes: scopeRows.map((r) => ({ scopeType: r.scope_type, scopeId: r.scope_id })),
        upgrades: upgradeRows.map(toPlanUpgrade),
        capitalSystemIds: capitalRows.map((r) => r.system_id)
      };
    }
  );

  ipcMain.handle(
    'plans.setCapital',
    (_, planId: number, systemId: number, isCapital: boolean): void => {
      const db = getDb();
      assertWritable(db, planId);
      db.transaction(() => {
        if (isCapital) {
          db.prepare('DELETE FROM plan_capital_systems WHERE plan_id = ?').run(planId);
          db.prepare(
            'INSERT INTO plan_capital_systems (plan_id, system_id) VALUES (?, ?)'
          ).run(planId, systemId);
        } else {
          db.prepare(
            'DELETE FROM plan_capital_systems WHERE plan_id = ? AND system_id = ?'
          ).run(planId, systemId);
        }
        db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(
          new Date().toISOString(),
          planId
        );
      })();
      broadcastPlanChanged(planId);
    }
  );

  ipcMain.handle('plans.create', (_, name: string): PlanSummary => {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db
      .prepare('INSERT INTO plans (name, created_at, updated_at) VALUES (?, ?, ?)')
      .run(name.trim(), now, now);
    const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(Number(result.lastInsertRowid)) as PlanDbRow;
    return toPlanSummary(row);
  });

  ipcMain.handle('plans.rename', (_, id: number, name: string): PlanSummary => {
    const now = new Date().toISOString();
    getDb()
      .prepare('UPDATE plans SET name = ?, updated_at = ? WHERE id = ?')
      .run(name.trim(), now, id);
    const row = getDb().prepare('SELECT * FROM plans WHERE id = ?').get(id) as PlanDbRow;
    return toPlanSummary(row);
  });

  ipcMain.handle('plans.setReadOnly', (_, id: number, readOnly: boolean): PlanSummary => {
    const db = getDb();
    db.prepare('UPDATE plans SET read_only = ?, updated_at = ? WHERE id = ?')
      .run(readOnly ? 1 : 0, new Date().toISOString(), id);
    const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(id) as PlanDbRow;
    return toPlanSummary(row);
  });

  ipcMain.handle('plans.delete', (_, id: number): void => {
    getDb().prepare('DELETE FROM plans WHERE id = ?').run(id);
    broadcastPlanChanged(id);
  });

  ipcMain.handle('plans.duplicate', (_, sourceId: number, newName: string): PlanSummary => {
    const db = getDb();
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('plan name is required');
    let createdId = -1;
    db.transaction(() => {
      const now = new Date().toISOString();
      const result = db
        .prepare('INSERT INTO plans (name, created_at, updated_at) VALUES (?, ?, ?)')
        .run(trimmed, now, now);
      createdId = Number(result.lastInsertRowid);
      db.prepare(
        `INSERT INTO plan_scopes (plan_id, scope_type, scope_id)
           SELECT ?, scope_type, scope_id FROM plan_scopes WHERE plan_id = ?`
      ).run(createdId, sourceId);
      db.prepare(
        `INSERT INTO plan_upgrades (plan_id, system_id, upgrade_name, ordering, notes, installed)
           SELECT ?, system_id, upgrade_name, ordering, notes, installed FROM plan_upgrades WHERE plan_id = ?`
      ).run(createdId, sourceId);
      db.prepare(
        `INSERT INTO plan_aln_links (plan_id, system_id, linked_system_id, linked_system_name)
           SELECT ?, system_id, linked_system_id, linked_system_name FROM plan_aln_links WHERE plan_id = ?`
      ).run(createdId, sourceId);
    })();
    const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(createdId) as PlanDbRow;
    return toPlanSummary(row);
  });

  ipcMain.handle('plans.setScopes', (_, planId: number, scopes: PlanScope[]): void => {
    const db = getDb();
    assertWritable(db, planId);
    const previous = db
      .prepare('SELECT scope_type, scope_id FROM plan_scopes WHERE plan_id = ?')
      .all(planId) as ScopeDbRow[];
    const incomingKeys = new Set(scopes.map((s) => `${s.scopeType}:${s.scopeId}`));
    const removedRegions = new Set<number>();
    const removedConstellations = new Set<number>();
    for (const p of previous) {
      const key = `${p.scope_type}:${p.scope_id}`;
      if (incomingKeys.has(key)) continue;
      if (p.scope_type === 'region') removedRegions.add(p.scope_id);
      else if (p.scope_type === 'constellation') removedConstellations.add(p.scope_id);
    }

    let filtered = scopes;
    if (removedRegions.size > 0 || removedConstellations.size > 0) {
      const sysRows = db
        .prepare(
          `SELECT id, constellation_id, region_id FROM systems
            WHERE constellation_id IN (${[...removedConstellations, 0].join(',')})
               OR region_id        IN (${[...removedRegions, 0].join(',')})`
        )
        .all() as Array<{ id: number; constellation_id: number; region_id: number }>;
      const droppedSystemIds = new Set<number>();
      for (const r of sysRows) {
        if (removedConstellations.has(r.constellation_id) || removedRegions.has(r.region_id)) {
          droppedSystemIds.add(r.id);
        }
      }
      const constRows = db
        .prepare(
          `SELECT id, region_id FROM constellations
            WHERE region_id IN (${[...removedRegions, 0].join(',')})`
        )
        .all() as Array<{ id: number; region_id: number }>;
      const droppedConstellationIds = new Set<number>();
      for (const c of constRows) {
        if (removedRegions.has(c.region_id)) droppedConstellationIds.add(c.id);
      }
      filtered = scopes.filter((s) => {
        if (s.scopeType === 'system' && droppedSystemIds.has(s.scopeId)) return false;
        if (s.scopeType === 'constellation' && droppedConstellationIds.has(s.scopeId)) return false;
        return true;
      });
    }

    const txn = db.transaction(() => {
      db.prepare('DELETE FROM plan_scopes WHERE plan_id = ?').run(planId);
      const ins = db.prepare(
        'INSERT INTO plan_scopes (plan_id, scope_type, scope_id) VALUES (?, ?, ?)'
      );
      for (const s of filtered) ins.run(planId, s.scopeType, s.scopeId);
      db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), planId);
    });
    txn();
    broadcastPlanChanged(planId);
  });

  ipcMain.handle(
    'plans.assignUpgrade',
    (_, planId: number, systemId: number, upgradeName: string): AssignResult => {
      const db = getDb();
      assertWritable(db, planId);

      const newKey = upgradeTypeKey(upgradeName);
      if (newKey) {
        const existing = db.prepare(
          `SELECT upgrade_name FROM plan_upgrades
           WHERE plan_id = ? AND system_id = ?`
        ).all(planId, systemId) as Array<{ upgrade_name: string }>;
        const conflict = existing.find((r) => upgradeTypeKey(r.upgrade_name) === newKey);
        if (conflict) {
          return {
            ok: false,
            error: `${upgradeTypeLabel(newKey)} (${conflict.upgrade_name}) is already assigned to this system. Only one is permitted.`
          };
        }
      }

      try {
        db.transaction(() => {
          db.prepare(
            `INSERT INTO plan_upgrades (plan_id, system_id, upgrade_name, ordering)
             VALUES (?, ?, ?, COALESCE(
               (SELECT MAX(ordering) + 1 FROM plan_upgrades WHERE plan_id = ? AND system_id = ?), 0))
             ON CONFLICT(plan_id, system_id, upgrade_name) DO NOTHING`
          ).run(planId, systemId, upgradeName, planId, systemId);
          if (/Advanced Logistics Network/i.test(upgradeName)) {
            db.prepare(
              `INSERT OR IGNORE INTO plan_structures (plan_id, system_id, structure_type, location, source)
               VALUES (?, ?, 'Ansiblex', 'Gate', 'upgrade')`
            ).run(planId, systemId);
          }
          db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), planId);
        })();
      } catch (err) {
        return { ok: false, error: String(err) };
      }
      const row = db.prepare(BALANCE_SQL_BY_SYSTEM).get({ planId, systemId }) as BalanceDbRow | undefined;
      const balance = row ? balanceFromRow(row) : undefined;
      broadcastPlanChanged(planId);
      return { ok: true, balance };
    }
  );

  ipcMain.handle(
    'plans.removeUpgrade',
    (_, planId: number, systemId: number, upgradeName: string): void => {
      const db = getDb();
      assertWritable(db, planId);
      db.transaction(() => {
        db.prepare(
          'DELETE FROM plan_upgrades WHERE plan_id = ? AND system_id = ? AND upgrade_name = ?'
        ).run(planId, systemId, upgradeName);
        if (/Advanced Logistics Network/i.test(upgradeName)) {
          db.prepare(
            `DELETE FROM plan_structures WHERE plan_id = ? AND system_id = ? AND source = 'upgrade' AND structure_type = 'Ansiblex'`
          ).run(planId, systemId);
        }
        db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), planId);
      })();
      broadcastPlanChanged(planId);
    }
  );

  ipcMain.handle(
    'plans.explodeScope',
    (
      _,
      planId: number,
      scopeType: 'region' | 'constellation',
      scopeId: number
    ): void => {
      const db = getDb();
      assertWritable(db, planId);
      let siblings: Array<{ id: number }> = [];
      if (scopeType === 'region') {
        siblings = db
          .prepare(
            `SELECT s.id FROM systems s
               JOIN system_budget sb ON sb.system_id = s.id
              WHERE s.region_id = ? AND sb.sov_eligible = 1`
          )
          .all(scopeId) as Array<{ id: number }>;
      } else {
        siblings = db
          .prepare(
            `SELECT s.id FROM systems s
               JOIN system_budget sb ON sb.system_id = s.id
              WHERE s.constellation_id = ? AND sb.sov_eligible = 1`
          )
          .all(scopeId) as Array<{ id: number }>;
      }
      db.transaction(() => {
        if (scopeType === 'region') {
          db.prepare(
            "DELETE FROM plan_scopes WHERE plan_id = ? AND scope_type = 'region' AND scope_id = ?"
          ).run(planId, scopeId);
          db.prepare(
            `DELETE FROM plan_scopes
              WHERE plan_id = ? AND scope_type = 'constellation'
                AND scope_id IN (SELECT id FROM constellations WHERE region_id = ?)`
          ).run(planId, scopeId);
        } else {
          db.prepare(
            "DELETE FROM plan_scopes WHERE plan_id = ? AND scope_type = 'constellation' AND scope_id = ?"
          ).run(planId, scopeId);
        }
        const ins = db.prepare(
          "INSERT OR IGNORE INTO plan_scopes (plan_id, scope_type, scope_id) VALUES (?, 'system', ?)"
        );
        for (const sib of siblings) ins.run(planId, sib.id);
        db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(
          new Date().toISOString(),
          planId
        );
      })();
      broadcastPlanChanged(planId);
    }
  );

  ipcMain.handle('plans.removeSystem', (_, planId: number, systemId: number): void => {
    const db = getDb();
    assertWritable(db, planId);
    const sys = db
      .prepare('SELECT constellation_id, region_id FROM systems WHERE id = ?')
      .get(systemId) as { constellation_id: number; region_id: number } | undefined;
    if (!sys) return;

    const regionScoped =
      db
        .prepare(
          "SELECT 1 FROM plan_scopes WHERE plan_id = ? AND scope_type = 'region' AND scope_id = ?"
        )
        .get(planId, sys.region_id) !== undefined;
    const constellationScoped =
      db
        .prepare(
          "SELECT 1 FROM plan_scopes WHERE plan_id = ? AND scope_type = 'constellation' AND scope_id = ?"
        )
        .get(planId, sys.constellation_id) !== undefined;

    db.transaction(() => {
      if (regionScoped) {
        const siblings = db
          .prepare(
            `SELECT s.id FROM systems s
               JOIN system_budget sb ON sb.system_id = s.id
              WHERE s.region_id = ? AND sb.sov_eligible = 1 AND s.id != ?`
          )
          .all(sys.region_id, systemId) as Array<{ id: number }>;
        db.prepare(
          "DELETE FROM plan_scopes WHERE plan_id = ? AND scope_type = 'region' AND scope_id = ?"
        ).run(planId, sys.region_id);
        db.prepare(
          `DELETE FROM plan_scopes
            WHERE plan_id = ? AND scope_type = 'constellation'
              AND scope_id IN (SELECT id FROM constellations WHERE region_id = ?)`
        ).run(planId, sys.region_id);
        const ins = db.prepare(
          "INSERT OR IGNORE INTO plan_scopes (plan_id, scope_type, scope_id) VALUES (?, 'system', ?)"
        );
        for (const sib of siblings) ins.run(planId, sib.id);
      } else if (constellationScoped) {
        const siblings = db
          .prepare(
            `SELECT s.id FROM systems s
               JOIN system_budget sb ON sb.system_id = s.id
              WHERE s.constellation_id = ? AND sb.sov_eligible = 1 AND s.id != ?`
          )
          .all(sys.constellation_id, systemId) as Array<{ id: number }>;
        db.prepare(
          "DELETE FROM plan_scopes WHERE plan_id = ? AND scope_type = 'constellation' AND scope_id = ?"
        ).run(planId, sys.constellation_id);
        const ins = db.prepare(
          "INSERT OR IGNORE INTO plan_scopes (plan_id, scope_type, scope_id) VALUES (?, 'system', ?)"
        );
        for (const sib of siblings) ins.run(planId, sib.id);
      } else {
        db.prepare(
          "DELETE FROM plan_scopes WHERE plan_id = ? AND scope_type = 'system' AND scope_id = ?"
        ).run(planId, systemId);
      }
      db.prepare('DELETE FROM plan_system_status WHERE plan_id = ? AND system_id = ?').run(
        planId,
        systemId
      );
      db.prepare('DELETE FROM plan_aln_links WHERE plan_id = ? AND system_id = ?').run(planId, systemId);
      db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), planId);
    })();
    broadcastPlanChanged(planId);
  });

  ipcMain.handle(
    'plans.setUpgradeInstalled',
    (_, planId: number, systemId: number, upgradeName: string, installed: boolean): void => {
      const db = getDb();
      assertWritable(db, planId);
      db.transaction(() => {
        db.prepare(
          `UPDATE plan_upgrades SET installed = ?
             WHERE plan_id = ? AND system_id = ? AND upgrade_name = ?`
        ).run(installed ? 1 : 0, planId, systemId, upgradeName);
        db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), planId);
      })();
      broadcastPlanChanged(planId);
    }
  );

  ipcMain.handle(
    'plans.clearUpgrades',
    (_, planId: number, scope: ClearUpgradesScope): void => {
      const db = getDb();
      assertWritable(db, planId);
      db.transaction(() => {
        if (scope.kind === 'plan') {
          db.prepare('DELETE FROM plan_upgrades WHERE plan_id = ?').run(planId);
          db.prepare('DELETE FROM plan_aln_links WHERE plan_id = ?').run(planId);
        } else if (scope.kind === 'system') {
          db.prepare('DELETE FROM plan_upgrades WHERE plan_id = ? AND system_id = ?').run(
            planId,
            scope.id
          );
          db.prepare('DELETE FROM plan_aln_links WHERE plan_id = ? AND system_id = ?').run(planId, scope.id);
        } else {
          db.prepare(
            `DELETE FROM plan_upgrades
               WHERE plan_id = ?
                 AND system_id IN (SELECT id FROM systems WHERE constellation_id = ?)`
          ).run(planId, scope.id);
          db.prepare(
            `DELETE FROM plan_aln_links
               WHERE plan_id = ?
                 AND system_id IN (SELECT id FROM systems WHERE constellation_id = ?)`
          ).run(planId, scope.id);
        }
        db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), planId);
      })();
      broadcastPlanChanged(planId);
    }
  );

  ipcMain.handle(
    'plans.systemBalance',
    (_, planId: number, systemId: number): SystemBalance | null => {
      const row = getDb()
        .prepare(BALANCE_SQL_BY_SYSTEM)
        .get({ planId, systemId }) as BalanceDbRow | undefined;
      return row ? balanceFromRow(row) : null;
    }
  );

  ipcMain.handle(
    'plans.setSystemStatus',
    (_, planId: number, systemId: number, status: SystemStatus): void => {
      const db = getDb();
      assertWritable(db, planId);
      db.transaction(() => {
        if (status === 'local') {
          db.prepare('DELETE FROM plan_system_status WHERE plan_id = ? AND system_id = ?').run(planId, systemId);
        } else {
          db.prepare(
            `INSERT INTO plan_system_status (plan_id, system_id, status) VALUES (?, ?, ?)
             ON CONFLICT(plan_id, system_id) DO UPDATE SET status = excluded.status`
          ).run(planId, systemId, status);
          if (status !== 'export') {
            db.prepare(
              `UPDATE plan_system_status
               SET transfer_amount = 0, destination_system_id = NULL, export_all_unused = 0
               WHERE plan_id = ? AND system_id = ?`
            ).run(planId, systemId);
          }
        }
        db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), planId);
      })();
      broadcastPlanChanged(planId);
    }
  );

  ipcMain.handle('plans.summary', (_, planId: number): PlanRollup => {
    const db = getDb();
    const rows = db
      .prepare(BALANCE_SQL_FOR_PLAN)
      .all({ planId }) as RollupDbRow[];
    const alnRows = db
      .prepare('SELECT system_id, linked_system_id, linked_system_name FROM plan_aln_links WHERE plan_id = ?')
      .all(planId) as Array<{ system_id: number; linked_system_id: number | null; linked_system_name: string }>;
    const alnBySystem = new Map<number, AlnLink>();
    for (const r of alnRows) {
      alnBySystem.set(r.system_id, { linkedSystemId: r.linked_system_id, linkedSystemName: r.linked_system_name });
    }
    const balances = rows.map((r) => rollupFromRow(r, alnBySystem.get(r.system_id) ?? null));
    const totals = balances.reduce(
      (acc, b) => {
        acc.availablePower += b.availablePower;
        acc.consumedPower += b.consumedPower;
        acc.availableWorkforce += b.availableWorkforce;
        acc.consumedWorkforce += b.consumedWorkforce;
        acc.availableIce += b.availableIce;
        acc.consumedIce += b.consumedIce;
        acc.availableGas += b.availableGas;
        acc.consumedGas += b.consumedGas;
        acc.startupFuel += b.startupFuel;
        return acc;
      },
      {
        availablePower: 0,
        consumedPower: 0,
        availableWorkforce: 0,
        consumedWorkforce: 0,
        availableIce: 0,
        consumedIce: 0,
        availableGas: 0,
        consumedGas: 0,
        startupFuel: 0
      }
    );
    return {
      planId,
      systemBalances: balances,
      unbalancedSystems: balances.filter((b) => !b.balanced),
      totals
    };
  });

  ipcMain.handle('plans.matrix', (_, planId: number): PlanMatrix => {
    const db = getDb();
    const sysRows = db
      .prepare(
        `WITH scope_systems AS (
           SELECT DISTINCT s.id AS sid FROM systems s
           JOIN plan_scopes ps ON
             (ps.scope_type = 'system'        AND ps.scope_id = s.id)              OR
             (ps.scope_type = 'constellation' AND ps.scope_id = s.constellation_id) OR
             (ps.scope_type = 'region'        AND ps.scope_id = s.region_id)
           WHERE ps.plan_id = @planId
         ),
         upgrade_systems AS (
           SELECT DISTINCT system_id AS sid FROM plan_upgrades WHERE plan_id = @planId
         ),
         status_systems AS (
           SELECT DISTINCT system_id AS sid FROM plan_system_status WHERE plan_id = @planId
         ),
         active_systems AS (
           SELECT sid FROM scope_systems
           UNION SELECT sid FROM upgrade_systems
           UNION SELECT sid FROM status_systems
         )
         SELECT s.id, s.name, s.constellation_id, c.name AS constellation_name,
                s.region_id, r.name AS region_name, s.security_status,
                COALESCE(pss.status, 'local') AS status
           FROM active_systems a
           JOIN systems s ON s.id = a.sid
           JOIN constellations c ON c.id = s.constellation_id
           JOIN regions r ON r.id = s.region_id
           LEFT JOIN plan_system_status pss
             ON pss.plan_id = @planId AND pss.system_id = s.id
          ORDER BY r.name, c.name, s.name`
      )
      .all({ planId }) as Array<{
      id: number;
      name: string;
      constellation_id: number;
      constellation_name: string;
      region_id: number;
      region_name: string;
      security_status: number | null;
      status: SystemStatus;
    }>;

    const upgradeRows = db
      .prepare(
        'SELECT system_id, upgrade_name, installed FROM plan_upgrades WHERE plan_id = ? ORDER BY system_id, ordering, upgrade_name'
      )
      .all(planId) as Array<{ system_id: number; upgrade_name: string; installed: number }>;

    const upgradesBySystem = new Map<number, { name: string; installed: boolean }[]>();
    for (const u of upgradeRows) {
      const arr = upgradesBySystem.get(u.system_id) ?? [];
      arr.push({ name: u.upgrade_name, installed: u.installed === 1 });
      upgradesBySystem.set(u.system_id, arr);
    }

    const alnLinkRows = db
      .prepare('SELECT system_id, linked_system_id, linked_system_name FROM plan_aln_links WHERE plan_id = ?')
      .all(planId) as Array<{ system_id: number; linked_system_id: number | null; linked_system_name: string }>;

    const alnBySystem = new Map<number, AlnLink>();
    for (const r of alnLinkRows) {
      alnBySystem.set(r.system_id, { linkedSystemId: r.linked_system_id, linkedSystemName: r.linked_system_name });
    }

    const balanceRows = db.prepare(BALANCE_SQL_FOR_PLAN).all({ planId }) as RollupDbRow[];
    const usageBySystem = new Map<number, { power: number; workforce: number; ice: number; gas: number }>();
    const rawBySystem = new Map<
      number,
      { consumedPower: number; availablePower: number; consumedWorkforce: number; availableWorkforce: number }
    >();
    for (const b of balanceRows) {
      const ratio = (consumed: number, available: number) =>
        available > 0 ? consumed / available : consumed > 0 ? Infinity : 0;
      usageBySystem.set(b.system_id, {
        power: ratio(b.consumed_power, b.available_power),
        workforce: ratio(b.consumed_workforce, b.available_workforce),
        ice: ratio(b.consumed_ice, b.available_ice),
        gas: ratio(b.consumed_gas, b.available_gas)
      });
      rawBySystem.set(b.system_id, {
        consumedPower: b.consumed_power,
        availablePower: b.available_power,
        consumedWorkforce: b.consumed_workforce,
        availableWorkforce: b.available_workforce
      });
    }

    const systems: PlanMatrixSystem[] = sysRows.map((r) => {
      const raw = rawBySystem.get(r.id);
      return {
        id: r.id,
        name: r.name,
        constellationId: r.constellation_id,
        constellationName: r.constellation_name,
        regionId: r.region_id,
        regionName: r.region_name,
        securityStatus: r.security_status,
        status: r.status,
        upgrades: upgradesBySystem.get(r.id) ?? [],
        usage: usageBySystem.get(r.id) ?? { power: 0, workforce: 0, ice: 0, gas: 0 },
        consumedPower: raw?.consumedPower ?? 0,
        availablePower: raw?.availablePower ?? 0,
        consumedWorkforce: raw?.consumedWorkforce ?? 0,
        availableWorkforce: raw?.availableWorkforce ?? 0,
        alnLink: alnBySystem.get(r.id) ?? null,
      };
    });

    return { systems };
  });

  ipcMain.handle(
    'plans.setWorkforceTransfer',
    (
      _,
      planId: number,
      sourceSystemId: number,
      destSystemId: number,
      amount: number,
      exportAllUnused: boolean
    ): SetTransferResult => {
      const db = getDb();
      assertWritable(db, planId);

      const srcRow = db
        .prepare('SELECT status FROM plan_system_status WHERE plan_id = ? AND system_id = ?')
        .get(planId, sourceSystemId) as { status: string } | undefined;
      if ((srcRow?.status ?? 'local') !== 'export') {
        return { ok: false, error: 'Source system must have export status' };
      }

      const dstRow = db
        .prepare('SELECT status FROM plan_system_status WHERE plan_id = ? AND system_id = ?')
        .get(planId, destSystemId) as { status: string } | undefined;
      if ((dstRow?.status ?? 'local') !== 'import') {
        return { ok: false, error: 'Destination system must have import status' };
      }

      if (!exportAllUnused && amount <= 0) {
        return { ok: false, error: 'Amount must be greater than 0' };
      }

      const path = findPath(db, sourceSystemId, destSystemId);
      if (!path.found) {
        return { ok: false, error: 'Systems are more than 3 jumps apart' };
      }

      for (const interId of path.intermediates) {
        const interRow = db
          .prepare('SELECT status FROM plan_system_status WHERE plan_id = ? AND system_id = ?')
          .get(planId, interId) as { status: string } | undefined;
        if ((interRow?.status ?? 'local') !== 'transit') {
          const name = (
            db.prepare('SELECT name FROM systems WHERE id = ?').get(interId) as { name: string } | undefined
          )?.name ?? String(interId);
          return { ok: false, error: `Intermediate system "${name}" must have transit status` };
        }
      }

      db.transaction(() => {
        db.prepare(
          `INSERT INTO plan_system_status
             (plan_id, system_id, status, transfer_amount, destination_system_id, export_all_unused)
           VALUES (@planId, @systemId, 'export', @amount, @destId, @exportAll)
           ON CONFLICT(plan_id, system_id) DO UPDATE SET
             transfer_amount       = excluded.transfer_amount,
             destination_system_id = excluded.destination_system_id,
             export_all_unused     = excluded.export_all_unused`
        ).run({
          planId,
          systemId: sourceSystemId,
          amount: exportAllUnused ? 0 : amount,
          destId: destSystemId,
          exportAll: exportAllUnused ? 1 : 0,
        });
        db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), planId);
      })();

      broadcastPlanChanged(planId);
      return { ok: true };
    }
  );

  ipcMain.handle(
    'plans.removeWorkforceTransfer',
    (_, planId: number, sourceSystemId: number): void => {
      const db = getDb();
      assertWritable(db, planId);
      db.transaction(() => {
        db.prepare(
          `UPDATE plan_system_status
           SET transfer_amount = 0, destination_system_id = NULL, export_all_unused = 0
           WHERE plan_id = ? AND system_id = ?`
        ).run(planId, sourceSystemId);
        db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), planId);
      })();
      broadcastPlanChanged(planId);
    }
  );

  ipcMain.handle(
    'plans.getWorkforceTransfers',
    (_, planId: number): WorkforceTransfer[] => {
      const rows = getDb()
        .prepare(
          `SELECT
             pss.system_id          AS source_system_id,
             src.name               AS source_name,
             pss.destination_system_id AS dest_system_id,
             dst.name               AS dest_name,
             pss.transfer_amount,
             pss.export_all_unused
           FROM plan_system_status pss
           JOIN systems src ON src.id = pss.system_id
           LEFT JOIN systems dst ON dst.id = pss.destination_system_id
           WHERE pss.plan_id = ?
             AND pss.status = 'export'
             AND pss.destination_system_id IS NOT NULL
           ORDER BY src.name`
        )
        .all(planId) as TransferDbRow[];

      return rows.map((r) => ({
        sourceSystemId: r.source_system_id,
        sourceName: r.source_name,
        destSystemId: r.dest_system_id,
        destName: r.dest_name ?? '',
        transferAmount: r.transfer_amount,
        exportAllUnused: r.export_all_unused === 1,
      }));
    }
  );

  ipcMain.handle(
    'plans.getReachableImportSystems',
    (_, planId: number, sourceSystemId: number): { systemId: number; systemName: string }[] => {
      const db = getDb();
      const reachable = reachableSystems(db, sourceSystemId, 3);
      if (reachable.length === 0) return [];

      const placeholders = reachable.map(() => '?').join(',');
      const rows = db
        .prepare(
          `SELECT pss.system_id, s.name AS system_name
           FROM plan_system_status pss
           JOIN systems s ON s.id = pss.system_id
           WHERE pss.plan_id = ?
             AND pss.status = 'import'
             AND pss.system_id IN (${placeholders})
           ORDER BY s.name`
        )
        .all(planId, ...reachable) as { system_id: number; system_name: string }[];

      return rows.map((r) => ({ systemId: r.system_id, systemName: r.system_name }));
    }
  );

  ipcMain.handle(
    'plans.getAlnTargets',
    (_, planId: number, systemId: number): { targets: AlnTarget[]; currentLink: AlnLink | null } => {
      const db = getDb();
      const src = db.prepare('SELECT x, y, z FROM systems WHERE id = ?').get(systemId) as
        | { x: number | null; y: number | null; z: number | null }
        | undefined;

      if (!src || src.x === null || src.y === null || src.z === null) {
        return { targets: [], currentLink: null };
      }

      const candidates = db
        .prepare('SELECT id, name, x, y, z FROM systems WHERE x IS NOT NULL AND id != ?')
        .all(systemId) as Array<{ id: number; name: string; x: number; y: number; z: number }>;

      const METERS_PER_AU = 149597870691;
      const AU_PER_LY = 63239.6717;
      const { x: sx, y: sy, z: sz } = src;

      const targets: AlnTarget[] = [];
      for (const c of candidates) {
        const dx = sx - c.x;
        const dy = sy - c.y;
        const dz = sz - c.z;
        const ly = Math.sqrt(dx * dx + dy * dy + dz * dz) / METERS_PER_AU / AU_PER_LY;
        if (ly <= 5) {
          targets.push({ systemId: c.id, systemName: c.name, distanceLy: ly });
        }
      }
      targets.sort((a, b) => a.distanceLy - b.distanceLy);

      const linkRow = db
        .prepare('SELECT linked_system_id, linked_system_name FROM plan_aln_links WHERE plan_id = ? AND system_id = ?')
        .get(planId, systemId) as { linked_system_id: number | null; linked_system_name: string } | undefined;

      const currentLink: AlnLink | null = linkRow
        ? { linkedSystemId: linkRow.linked_system_id, linkedSystemName: linkRow.linked_system_name }
        : null;

      return { targets, currentLink };
    }
  );

  ipcMain.handle(
    'plans.setAlnLink',
    (
      _,
      planId: number,
      systemId: number,
      linkedSystemId: number | null,
      linkedSystemName: string
    ): { ok: boolean; error?: string } => {
      if (!linkedSystemName.trim()) return { ok: false, error: 'Linked system name is required.' };
      const db = getDb();
      assertWritable(db, planId);

      const sourceName = (db.prepare('SELECT name FROM systems WHERE id = ?').get(systemId) as { name: string } | undefined)?.name ?? String(systemId);

      db.transaction(() => {
        // Write the forward link (source → target).
        db.prepare(
          `INSERT INTO plan_aln_links (plan_id, system_id, linked_system_id, linked_system_name)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(plan_id, system_id) DO UPDATE SET
             linked_system_id   = excluded.linked_system_id,
             linked_system_name = excluded.linked_system_name`
        ).run(planId, systemId, linkedSystemId, linkedSystemName.trim());

        // Write the reverse link and ensure the ALN upgrade is assigned — only when the
        // target is a known local system (linkedSystemId non-null).
        if (linkedSystemId !== null) {
          // Assign ALN upgrade to the target system if not already present.
          db.prepare(
            `INSERT INTO plan_upgrades (plan_id, system_id, upgrade_name, ordering)
             VALUES (?, ?, 'Advanced Logistics Network', COALESCE(
               (SELECT MAX(ordering) + 1 FROM plan_upgrades WHERE plan_id = ? AND system_id = ?), 0))
             ON CONFLICT(plan_id, system_id, upgrade_name) DO NOTHING`
          ).run(planId, linkedSystemId, planId, linkedSystemId);
          db.prepare(
            `INSERT OR IGNORE INTO plan_structures (plan_id, system_id, structure_type, location, source)
             VALUES (?, ?, 'Ansiblex', 'Gate', 'upgrade')`
          ).run(planId, linkedSystemId);

          // Write the reverse link (target → source).
          db.prepare(
            `INSERT INTO plan_aln_links (plan_id, system_id, linked_system_id, linked_system_name)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(plan_id, system_id) DO UPDATE SET
               linked_system_id   = excluded.linked_system_id,
               linked_system_name = excluded.linked_system_name`
          ).run(planId, linkedSystemId, systemId, sourceName);
        }

        db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), planId);
      })();
      broadcastPlanChanged(planId);
      return { ok: true };
    }
  );

  ipcMain.handle('plans.removeAlnLink', (_, planId: number, systemId: number): void => {
    const db = getDb();
    assertWritable(db, planId);
    db.transaction(() => {
      // Remove forward link.
      const fwd = db.prepare('SELECT linked_system_id FROM plan_aln_links WHERE plan_id = ? AND system_id = ?')
        .get(planId, systemId) as { linked_system_id: number | null } | undefined;
      db.prepare('DELETE FROM plan_aln_links WHERE plan_id = ? AND system_id = ?').run(planId, systemId);

      // Remove reverse link only if it still points back at the source system.
      if (fwd?.linked_system_id !== null && fwd?.linked_system_id !== undefined) {
        db.prepare(
          'DELETE FROM plan_aln_links WHERE plan_id = ? AND system_id = ? AND linked_system_id = ?'
        ).run(planId, fwd.linked_system_id, systemId);
      }

      db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), planId);
    })();
    broadcastPlanChanged(planId);
  });

  ipcMain.handle(
    'plans.searchSystems',
    (_, query: string): { systemId: number; systemName: string }[] => {
      const rows = getDb()
        .prepare('SELECT id, name FROM systems WHERE name LIKE ? LIMIT 50')
        .all(`%${query}%`) as { id: number; name: string }[];
      return rows.map((r) => ({ systemId: r.id, systemName: r.name }));
    }
  );

  ipcMain.handle('plans.audit', (_, planId: number): PlanAuditResult => {
    const db = getDb();

    // Fetch all systems in the plan with their balance and upgrade list.
    interface AuditRow extends RollupDbRow {
      security_status: number | null;
    }
    const rows = db.prepare(BALANCE_SQL_FOR_PLAN).all({ planId }) as AuditRow[];

    // Costs of the cheapest tier-1 variants we check for spare capacity.
    const oreProspRow = db
      .prepare(`SELECT power, workforce FROM upgrades WHERE name LIKE '% Prospecting Array 1' LIMIT 1`)
      .get() as { power: number; workforce: number } | undefined;
    const majorThreatRow = db
      .prepare(`SELECT power, workforce FROM upgrades WHERE name = 'Major Threat Detection Array 1'`)
      .get() as { power: number; workforce: number } | undefined;

    const oreProspCost = oreProspRow ?? { power: 0, workforce: 0 };
    const majorThreatCost = majorThreatRow ?? { power: 0, workforce: 0 };

    // "Ishtar-capable" = system has any Major Threat Detection Array (grants Forsaken Hubs at minimum).
    function hasIshtarSite(upgrades: string[]): boolean {
      return upgrades.some((name) => /^Major Threat Detection Array \d$/.test(name));
    }

    function miningTier(upgrades: string[]): number {
      let best = 0;
      for (const name of upgrades) {
        const m = name.match(/Prospecting Array (\d)$/);
        if (m) best = Math.max(best, parseInt(m[1], 10));
      }
      return best;
    }

    function hasProspecting(upgrades: string[]): boolean {
      return upgrades.some((n) => /Prospecting Array/.test(n));
    }

    function hasMajorThreat(upgrades: string[]): boolean {
      return upgrades.some((n) => /^Major Threat Detection Array/.test(n));
    }

    const findings: AuditFinding[] = [];

    for (const r of rows) {
      const upgrades = r.upgrade_names ? r.upgrade_names.split(String.fromCharCode(31)) : [];
      const remainPower = r.available_power - r.consumed_power;
      const remainWorkforce = r.available_workforce - r.consumed_workforce;
      const loc = { systemId: r.system_id, systemName: r.system_name, constellationName: r.constellation_name, regionName: r.region_name };

      // 1. No Ishtar-capable sites AND mining below tier 2
      if (!hasIshtarSite(upgrades) && miningTier(upgrades) < 2) {
        findings.push({
          ...loc,
          kind: 'no-ishtar-sites-low-mining',
          detail: 'No Major Threat Detection Array assigned and mining tier below 2.',
        });
      }

      // 2. Over power or workforce
      if (r.consumed_power > r.available_power) {
        findings.push({
          ...loc,
          kind: 'over-power',
          detail: `Power exceeded: ${r.consumed_power} / ${r.available_power} used.`,
        });
      }
      if (r.consumed_workforce > r.available_workforce) {
        findings.push({
          ...loc,
          kind: 'over-workforce',
          detail: `Workforce exceeded: ${r.consumed_workforce} / ${r.available_workforce} used.`,
        });
      }

      // 3. Spare capacity for another Ore Prospecting Array (any mineral, tier 1)
      if (
        remainPower >= oreProspCost.power &&
        remainWorkforce >= oreProspCost.workforce &&
        hasProspecting(upgrades)
      ) {
        findings.push({
          ...loc,
          kind: 'fits-ore-prospecting',
          detail: `${remainPower} power / ${remainWorkforce} workforce remaining — fits another Ore Prospecting Array.`,
        });
      }

      // 4. Spare capacity for another Major Threat Detection Array 1
      if (
        remainPower >= majorThreatCost.power &&
        remainWorkforce >= majorThreatCost.workforce &&
        hasMajorThreat(upgrades)
      ) {
        findings.push({
          ...loc,
          kind: 'fits-major-threat',
          detail: `${remainPower} power / ${remainWorkforce} workforce remaining — fits a Major Threat Detection Array upgrade.`,
        });
      }
    }

    return { planId, findings };
  });
}
