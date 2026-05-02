import type {
    PlanStructure,
    StructureAddPayload,
    StructureLocation,
    StructureNode,
    StructureType,
} from "@shared/index";
import { BrowserWindow, ipcMain } from "electron";
import { getDb } from "../db/userDb.js";

interface StructureDbRow {
    id: number;
    plan_id: number;
    system_id: number;
    structure_type: string;
    name: string | null;
    location: string | null;
    moon_id: number | null;
    notes: string | null;
    source: string;
    system_name: string;
    constellation_id: number;
    constellation_name: string;
    region_id: number;
    region_name: string;
}

function rowToStructure(row: StructureDbRow): PlanStructure {
    return {
        id: row.id,
        planId: row.plan_id,
        systemId: row.system_id,
        structureType: row.structure_type as StructureType,
        name: row.name,
        location: row.location as StructureLocation | null,
        moonId: row.moon_id,
        notes: row.notes,
        source: row.source as PlanStructure["source"],
    };
}

function groupIntoNodes(rows: StructureDbRow[]): StructureNode[] {
    const bySystem = new Map<number, StructureNode>();
    for (const row of rows) {
        if (!bySystem.has(row.system_id)) {
            bySystem.set(row.system_id, {
                systemId: row.system_id,
                systemName: row.system_name,
                constellationId: row.constellation_id,
                constellationName: row.constellation_name,
                regionId: row.region_id,
                regionName: row.region_name,
                structures: [],
            });
        }
        bySystem.get(row.system_id)!.structures.push(rowToStructure(row));
    }
    return Array.from(bySystem.values());
}

function inferType(line: string): {
    structureType: StructureType;
    location: StructureLocation | null;
} {
    const l = line.toLowerCase();
    if (l.includes("keepstar"))
        return { structureType: "Keepstar", location: "Deep" };
    if (l.includes("fortizar"))
        return { structureType: "Fortizar", location: "Deep" };
    if (l.includes("astrahus"))
        return { structureType: "Astrahus", location: "Deep" };
    if (l.includes("azbel"))
        return { structureType: "Azbel", location: "Deep" };
    if (l.includes("raitaru"))
        return { structureType: "Raitaru", location: "Deep" };
    if (l.includes("tenebrex"))
        return { structureType: "Tenebrex", location: "Deep" };
    if (l.includes("pharolux"))
        return { structureType: "Pharolux", location: "Deep" };
    if (l.includes("ansiblex"))
        return { structureType: "Ansiblex", location: "Gate" };
    if (l.includes("metenox"))
        return { structureType: "Metenox", location: "Moon" };
    if (l.includes("athanor"))
        return { structureType: "Athanor", location: "Moon" };
    if (l.includes("tatara"))
        return { structureType: "Tatara", location: "Moon" };
    if (l.includes("sotiyo"))
        return { structureType: "Sotiyo", location: "Deep" };
    return { structureType: "Other", location: null };
}

function broadcastPlanChanged(planId: number): void {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("plan-changed", { planId });
    }
}

const LIST_SQL = `
  SELECT ps.id, ps.plan_id, ps.system_id, ps.structure_type, ps.name, ps.location,
         ps.moon_id, ps.notes, ps.source,
         s.name AS system_name,
         c.id AS constellation_id, c.name AS constellation_name,
         r.id AS region_id, r.name AS region_name
  FROM plan_structures ps
  JOIN systems s ON s.id = ps.system_id
  JOIN constellations c ON c.id = s.constellation_id
  JOIN regions r ON r.id = c.region_id
  WHERE ps.plan_id = @planId
  ORDER BY r.name, c.name, s.name, ps.id
`;

const LIST_BY_SYSTEM_SQL = `
  SELECT ps.id, ps.plan_id, ps.system_id, ps.structure_type, ps.name, ps.location,
         ps.moon_id, ps.notes, ps.source,
         s.name AS system_name,
         c.id AS constellation_id, c.name AS constellation_name,
         r.id AS region_id, r.name AS region_name
  FROM plan_structures ps
  JOIN systems s ON s.id = ps.system_id
  JOIN constellations c ON c.id = s.constellation_id
  JOIN regions r ON r.id = c.region_id
  WHERE ps.plan_id = @planId AND ps.system_id = @systemId
  ORDER BY ps.id
`;

export function registerStructuresIpc(): void {
    ipcMain.handle(
        "structures.list",
        (_, planId: number, systemId?: number): StructureNode[] => {
            const db = getDb();
            const rows =
                systemId != null
                    ? (db
                          .prepare(LIST_BY_SYSTEM_SQL)
                          .all({ planId, systemId }) as StructureDbRow[])
                    : (db
                          .prepare(LIST_SQL)
                          .all({ planId }) as StructureDbRow[]);
            return groupIntoNodes(rows);
        },
    );

    ipcMain.handle(
        "structures.add",
        (
            _,
            planId: number,
            systemId: number,
            structure: StructureAddPayload,
        ): { id: number } => {
            const db = getDb();
            const result = db
                .prepare(
                    `INSERT INTO plan_structures (plan_id, system_id, structure_type, name, location, notes, source)
         VALUES (?, ?, ?, ?, ?, ?, 'manual')`,
                )
                .run(
                    planId,
                    systemId,
                    structure.structureType,
                    structure.name ?? null,
                    structure.location ?? null,
                    structure.notes ?? null,
                );
            broadcastPlanChanged(planId);
            return { id: result.lastInsertRowid as number };
        },
    );

    ipcMain.handle(
        "structures.remove",
        (_, planId: number, structureId: number): void => {
            const db = getDb();
            db.prepare(
                "DELETE FROM plan_structures WHERE id = ? AND plan_id = ?",
            ).run(structureId, planId);
            broadcastPlanChanged(planId);
        },
    );

    ipcMain.handle(
        "structures.importClipboard",
        (
            _,
            planId: number,
            systemId: number,
            text: string,
        ): { count: number } => {
            const db = getDb();
            const lines = text
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);
            const ins = db.prepare(
                `INSERT INTO plan_structures (plan_id, system_id, structure_type, name, location, source)
         VALUES (?, ?, ?, ?, ?, 'clipboard')`,
            );
            let count = 0;
            db.transaction(() => {
                for (const line of lines) {
                    const { structureType, location } = inferType(line);
                    ins.run(planId, systemId, structureType, line, location);
                    count++;
                }
            })();
            if (count > 0) broadcastPlanChanged(planId);
            return { count };
        },
    );
}
