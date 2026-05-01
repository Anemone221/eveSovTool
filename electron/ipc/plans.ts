import { BrowserWindow, ipcMain } from 'electron';
import { getDb } from '../db/userDb.js';
import { findPath, reachableSystems } from './adjacency.js';
import type {
  AssignResult,
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
  updatedAt: r.updated_at
});

const toPlanUpgrade = (r: PlanUpgradeDbRow): PlanUpgradeRow => ({
  planId: r.plan_id,
  systemId: r.system_id,
  upgradeName: r.upgrade_name,
  ordering: r.ordering,
  notes: r.notes
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

function rollupFromRow(r: RollupDbRow): PlanRollupRow {
  return {
    ...balanceFromRow(r),
    systemName: r.system_name,
    constellationId: r.constellation_id,
    constellationName: r.constellation_name,
    regionId: r.region_id,
    regionName: r.region_name,
    securityStatus: r.security_status
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
    COALESCE(SUM(u.startup), 0)          AS startup_fuel
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
    (_, id: number): { plan: PlanSummary; scopes: PlanScope[]; upgrades: PlanUpgradeRow[] } | null => {
      const db = getDb();
      const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(id) as PlanDbRow | undefined;
      if (!plan) return null;
      const scopeRows = db
        .prepare('SELECT scope_type, scope_id FROM plan_scopes WHERE plan_id = ?')
        .all(id) as ScopeDbRow[];
      const upgradeRows = db
        .prepare('SELECT * FROM plan_upgrades WHERE plan_id = ? ORDER BY system_id, ordering, upgrade_name')
        .all(id) as PlanUpgradeDbRow[];
      return {
        plan: toPlanSummary(plan),
        scopes: scopeRows.map((r) => ({ scopeType: r.scope_type, scopeId: r.scope_id })),
        upgrades: upgradeRows.map(toPlanUpgrade)
      };
    }
  );

  ipcMain.handle('plans.create', (_, name: string): PlanSummary => {
    const now = new Date().toISOString();
    const result = getDb()
      .prepare('INSERT INTO plans (name, created_at, updated_at) VALUES (?, ?, ?)')
      .run(name.trim(), now, now);
    return { id: Number(result.lastInsertRowid), name: name.trim(), createdAt: now, updatedAt: now };
  });

  ipcMain.handle('plans.rename', (_, id: number, name: string): PlanSummary => {
    const now = new Date().toISOString();
    getDb()
      .prepare('UPDATE plans SET name = ?, updated_at = ? WHERE id = ?')
      .run(name.trim(), now, id);
    const row = getDb().prepare('SELECT * FROM plans WHERE id = ?').get(id) as PlanDbRow;
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
        `INSERT INTO plan_upgrades (plan_id, system_id, upgrade_name, ordering, notes)
           SELECT ?, system_id, upgrade_name, ordering, notes FROM plan_upgrades WHERE plan_id = ?`
      ).run(createdId, sourceId);
    })();
    const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(createdId) as PlanDbRow;
    return toPlanSummary(row);
  });

  ipcMain.handle('plans.setScopes', (_, planId: number, scopes: PlanScope[]): void => {
    const db = getDb();
    const txn = db.transaction(() => {
      db.prepare('DELETE FROM plan_scopes WHERE plan_id = ?').run(planId);
      const ins = db.prepare(
        'INSERT INTO plan_scopes (plan_id, scope_type, scope_id) VALUES (?, ?, ?)'
      );
      for (const s of scopes) ins.run(planId, s.scopeType, s.scopeId);
      db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), planId);
    });
    txn();
    broadcastPlanChanged(planId);
  });

  ipcMain.handle(
    'plans.assignUpgrade',
    (_, planId: number, systemId: number, upgradeName: string): AssignResult => {
      const db = getDb();
      try {
        db.transaction(() => {
          db.prepare(
            `INSERT INTO plan_upgrades (plan_id, system_id, upgrade_name, ordering)
             VALUES (?, ?, ?, COALESCE(
               (SELECT MAX(ordering) + 1 FROM plan_upgrades WHERE plan_id = ? AND system_id = ?), 0))
             ON CONFLICT(plan_id, system_id, upgrade_name) DO NOTHING`
          ).run(planId, systemId, upgradeName, planId, systemId);
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
      db.transaction(() => {
        db.prepare(
          'DELETE FROM plan_upgrades WHERE plan_id = ? AND system_id = ? AND upgrade_name = ?'
        ).run(planId, systemId, upgradeName);
        db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), planId);
      })();
      broadcastPlanChanged(planId);
    }
  );

  ipcMain.handle('plans.removeSystem', (_, planId: number, systemId: number): void => {
    const db = getDb();
    db.transaction(() => {
      db.prepare('DELETE FROM plan_upgrades WHERE plan_id = ? AND system_id = ?').run(planId, systemId);
      db.prepare(
        "DELETE FROM plan_scopes WHERE plan_id = ? AND scope_type = 'system' AND scope_id = ?"
      ).run(planId, systemId);
      db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), planId);
    })();
    broadcastPlanChanged(planId);
  });

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
    const rows = getDb()
      .prepare(BALANCE_SQL_FOR_PLAN)
      .all({ planId }) as RollupDbRow[];
    const balances = rows.map(rollupFromRow);
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
        'SELECT system_id, upgrade_name FROM plan_upgrades WHERE plan_id = ? ORDER BY system_id, ordering, upgrade_name'
      )
      .all(planId) as Array<{ system_id: number; upgrade_name: string }>;

    const upgradesBySystem = new Map<number, string[]>();
    for (const u of upgradeRows) {
      const arr = upgradesBySystem.get(u.system_id) ?? [];
      arr.push(u.upgrade_name);
      upgradesBySystem.set(u.system_id, arr);
    }

    const systems: PlanMatrixSystem[] = sysRows.map((r) => ({
      id: r.id,
      name: r.name,
      constellationId: r.constellation_id,
      constellationName: r.constellation_name,
      regionId: r.region_id,
      regionName: r.region_name,
      securityStatus: r.security_status,
      status: r.status,
      upgrades: upgradesBySystem.get(r.id) ?? []
    }));

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
}
