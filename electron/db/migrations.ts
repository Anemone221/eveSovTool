import { existsSync } from "node:fs";
import type { DB } from "./connection.js";

export function runMigrations(db: DB, seedPath?: string): void {
    const cols = (
        db.prepare("PRAGMA table_info(plan_system_status)").all() as {
            name: string;
        }[]
    ).map((r) => r.name);

    if (!cols.includes("transfer_amount")) {
        db.exec(
            "ALTER TABLE plan_system_status ADD COLUMN transfer_amount INTEGER NOT NULL DEFAULT 0",
        );
    }
    if (!cols.includes("destination_system_id")) {
        db.exec(
            "ALTER TABLE plan_system_status ADD COLUMN destination_system_id INTEGER",
        );
    }
    if (!cols.includes("export_all_unused")) {
        db.exec(
            "ALTER TABLE plan_system_status ADD COLUMN export_all_unused INTEGER NOT NULL DEFAULT 0",
        );
    }

    const upgradeCols = (
        db.prepare("PRAGMA table_info(plan_upgrades)").all() as {
            name: string;
        }[]
    ).map((r) => r.name);
    if (!upgradeCols.includes("installed")) {
        db.exec(
            "ALTER TABLE plan_upgrades ADD COLUMN installed INTEGER NOT NULL DEFAULT 0",
        );
    }

    const systemCols = (
        db.prepare("PRAGMA table_info(systems)").all() as { name: string }[]
    ).map((r) => r.name);
    if (!systemCols.includes("x")) {
        db.exec("ALTER TABLE systems ADD COLUMN x REAL DEFAULT NULL");
    }
    if (!systemCols.includes("y")) {
        db.exec("ALTER TABLE systems ADD COLUMN y REAL DEFAULT NULL");
    }
    if (!systemCols.includes("z")) {
        db.exec("ALTER TABLE systems ADD COLUMN z REAL DEFAULT NULL");
    }

    db.exec(`CREATE TABLE IF NOT EXISTS plan_aln_links (
    plan_id             INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    system_id           INTEGER NOT NULL REFERENCES systems(id),
    linked_system_id    INTEGER,
    linked_system_name  TEXT    NOT NULL,
    PRIMARY KEY (plan_id, system_id)
  )`);

    const planetCols = (
        db.prepare("PRAGMA table_info(planets)").all() as { name: string }[]
    ).map((r) => r.name);
    if (!planetCols.includes("planet_type")) {
        db.exec("ALTER TABLE planets ADD COLUMN planet_type TEXT");
    }

    // Backfill planet_type from seed.db if this user DB has planets with NULL planet_type.
    const missingPlanetType = (
        db
            .prepare(
                "SELECT COUNT(*) AS n FROM planets WHERE planet_type IS NULL",
            )
            .get() as { n: number }
    ).n;
    if (missingPlanetType > 0 && seedPath && existsSync(seedPath)) {
        db.exec(`ATTACH DATABASE '${seedPath.replace(/'/g, "''")}' AS seed`);
        try {
            db.prepare(
                "UPDATE planets SET planet_type = (SELECT planet_type FROM seed.planets sp WHERE sp.id = planets.id) WHERE planet_type IS NULL",
            ).run();
        } finally {
            db.exec("DETACH DATABASE seed");
        }
    }

    const regionCols = (
        db.prepare("PRAGMA table_info(regions)").all() as { name: string }[]
    ).map((r) => r.name);
    if (!regionCols.includes("map_svg")) {
        db.exec("ALTER TABLE regions ADD COLUMN map_svg TEXT");
    }

    const upgradeColNames = (
        db.prepare("PRAGMA table_info(upgrades)").all() as { name: string }[]
    ).map((r) => r.name);
    if (!upgradeColNames.includes("icon")) {
        db.exec("ALTER TABLE upgrades ADD COLUMN icon BLOB");
    }

    // Recreate moon_scans with the correct UNIQUE(system_id, moon_number, ore_type)
    // constraint. The original table had UNIQUE(system_id, moon_number) which only
    // stored one ore per moon — detect by inspecting the sqlite_master SQL.
    const moonScansInfo = db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='moon_scans'")
        .get() as { sql: string } | undefined;
    // Check whether the UNIQUE constraint already includes ore_type.
    // The old constraint was UNIQUE(system_id, moon_number); the new one adds ore_type.
    const hasCorrectUnique = moonScansInfo?.sql
        ? /UNIQUE\s*\([^)]*ore_type[^)]*\)/i.test(moonScansInfo.sql)
        : true;
    if (moonScansInfo && !hasCorrectUnique) {
        db.transaction(() => {
            db.exec(`
                ALTER TABLE moon_scans RENAME TO moon_scans_old;

                CREATE TABLE moon_scans (
                  id          INTEGER PRIMARY KEY AUTOINCREMENT,
                  session_id  INTEGER REFERENCES moon_scan_sessions(id) ON DELETE CASCADE,
                  system_id   INTEGER NOT NULL REFERENCES systems(id),
                  moon_number INTEGER NOT NULL,
                  ore_type    TEXT NOT NULL,
                  ore_percent REAL NOT NULL,
                  scan_date   TEXT,
                  UNIQUE(system_id, moon_number, ore_type)
                );
                CREATE INDEX IF NOT EXISTS idx_moon_scans_system ON moon_scans(system_id);

                INSERT OR IGNORE INTO moon_scans
                  (id, session_id, system_id, moon_number, ore_type, ore_percent, scan_date)
                  SELECT id, session_id, system_id, moon_number, ore_type, ore_percent, scan_date
                  FROM moon_scans_old;

                DROP TABLE moon_scans_old;
            `);
        })();
    }

    const moonScanCols = (
        db.prepare("PRAGMA table_info(moon_scans)").all() as { name: string }[]
    ).map((r) => r.name);
    if (!moonScanCols.includes("planet_name")) {
        db.exec("ALTER TABLE moon_scans ADD COLUMN planet_name TEXT");
    }

    const planCols = (
        db.prepare("PRAGMA table_info(plans)").all() as { name: string }[]
    ).map((r) => r.name);
    if (!planCols.includes("read_only")) {
        db.exec("ALTER TABLE plans ADD COLUMN read_only INTEGER NOT NULL DEFAULT 0");
    }

    // Unconditionally sync all seeded read-only tables from seed.db so that
    // re-seeding (e.g. updated SVGs, new sov data) propagates to existing user DBs
    // without requiring a manual app.db delete.
    if (seedPath && existsSync(seedPath)) {
        const escaped = seedPath.replace(/'/g, "''");
        db.exec(`ATTACH DATABASE '${escaped}' AS seed`);
        try {
            db.transaction(() => {
                db.exec(`
          INSERT OR REPLACE INTO regions (id, name, faction_id, map_svg)
            SELECT id, name, faction_id, map_svg FROM seed.regions;

          INSERT OR REPLACE INTO constellations (id, region_id, name, faction_id)
            SELECT id, region_id, name, faction_id FROM seed.constellations;

          INSERT OR REPLACE INTO systems (id, constellation_id, region_id, name, security_status, security_class, x, y, z)
            SELECT id, constellation_id, region_id, name, security_status, security_class, x, y, z FROM seed.systems;

          INSERT OR REPLACE INTO stars (id, system_id, spectral_class, description, power)
            SELECT id, system_id, spectral_class, description, power FROM seed.stars;

          INSERT OR REPLACE INTO planets (id, system_id, name, power, workforce, superionic_ice_per_hour, magmatic_gas_per_hour, planet_type)
            SELECT id, system_id, name, power, workforce, superionic_ice_per_hour, magmatic_gas_per_hour, planet_type FROM seed.planets;

          INSERT OR REPLACE INTO upgrades (name, power, workforce, superionic_ice, magmatic_gas, startup, icon)
            SELECT name, power, workforce, superionic_ice, magmatic_gas, startup, icon FROM seed.upgrades;

          INSERT OR REPLACE INTO system_adjacency (system_id, neighbor_id)
            SELECT system_id, neighbor_id FROM seed.system_adjacency;
        `);
            })();
        } finally {
            db.exec("DETACH DATABASE seed");
        }
    }
}
