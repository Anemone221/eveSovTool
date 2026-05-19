import { existsSync } from "node:fs";
import Database from "better-sqlite3";
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
        const seed = new Database(seedPath, { readonly: true });
        try {
            const rows = seed.prepare('SELECT id, planet_type FROM planets').all() as { id: number; planet_type: string | null }[];
            const upd = db.prepare('UPDATE planets SET planet_type = ? WHERE id = ? AND planet_type IS NULL');
            db.transaction(() => { for (const r of rows) upd.run(r.planet_type, r.id); })();
        } finally {
            seed.close();
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

    // Moon scans were keyed on (system_id, moon_number, ore_type) which collides
    // across planets — "Horkkisen VI - Moon 1" and "Horkkisen IX - Moon 1" both
    // become (system=Horkkisen, moon=1). Fix: store the EVE MoonID from the
    // clipboard and key on it. Existing rows are wiped because they were never
    // captured with a MoonID and re-pasting is cheap.
    if (!moonScanCols.includes("moon_id")) {
        db.exec(`
            DROP TABLE IF EXISTS moon_scans;
            DROP TABLE IF EXISTS moon_drill_assignments;

            CREATE TABLE moon_scans (
              id          INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id  INTEGER REFERENCES moon_scan_sessions(id) ON DELETE CASCADE,
              system_id   INTEGER NOT NULL REFERENCES systems(id),
              moon_id     INTEGER NOT NULL,
              moon_number INTEGER NOT NULL,
              planet_name TEXT,
              ore_type    TEXT NOT NULL,
              ore_percent REAL NOT NULL,
              scan_date   TEXT,
              UNIQUE(moon_id, ore_type)
            );
            CREATE INDEX idx_moon_scans_system ON moon_scans(system_id);

            CREATE TABLE moon_drill_assignments (
              moon_id        INTEGER PRIMARY KEY,
              system_id      INTEGER NOT NULL REFERENCES systems(id),
              structure_type TEXT NOT NULL
            );
        `);
    }

    // Index on moon_id lives here (not in SCHEMA_SQL) because the column may not
    // exist when SCHEMA_SQL runs against a legacy user DB.
    db.exec("CREATE INDEX IF NOT EXISTS idx_moon_scans_moon ON moon_scans(moon_id)");

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
        const seed = new Database(seedPath, { readonly: true });
        try {
            const regions = seed.prepare('SELECT id, name, faction_id, map_svg FROM regions').all();
            const constellations = seed.prepare('SELECT id, region_id, name, faction_id FROM constellations').all();
            const systems = seed.prepare('SELECT id, constellation_id, region_id, name, security_status, security_class, x, y, z FROM systems').all();
            const stars = seed.prepare('SELECT id, system_id, spectral_class, description, power FROM stars').all();
            const planets = seed.prepare('SELECT id, system_id, name, power, workforce, superionic_ice_per_hour, magmatic_gas_per_hour, planet_type FROM planets').all();
            const upgrades = seed.prepare('SELECT name, power, workforce, superionic_ice, magmatic_gas, startup, icon FROM upgrades').all();
            const adjacency = seed.prepare('SELECT system_id, neighbor_id FROM system_adjacency').all();

            db.transaction(() => {
                const insRegion = db.prepare('INSERT OR REPLACE INTO regions (id, name, faction_id, map_svg) VALUES (@id, @name, @faction_id, @map_svg)');
                for (const r of regions) insRegion.run(r);

                const insConst = db.prepare('INSERT OR REPLACE INTO constellations (id, region_id, name, faction_id) VALUES (@id, @region_id, @name, @faction_id)');
                for (const r of constellations) insConst.run(r);

                const insSys = db.prepare('INSERT OR REPLACE INTO systems (id, constellation_id, region_id, name, security_status, security_class, x, y, z) VALUES (@id, @constellation_id, @region_id, @name, @security_status, @security_class, @x, @y, @z)');
                for (const r of systems) insSys.run(r);

                const insStar = db.prepare('INSERT OR REPLACE INTO stars (id, system_id, spectral_class, description, power) VALUES (@id, @system_id, @spectral_class, @description, @power)');
                for (const r of stars) insStar.run(r);

                const insPlanet = db.prepare('INSERT OR REPLACE INTO planets (id, system_id, name, power, workforce, superionic_ice_per_hour, magmatic_gas_per_hour, planet_type) VALUES (@id, @system_id, @name, @power, @workforce, @superionic_ice_per_hour, @magmatic_gas_per_hour, @planet_type)');
                for (const r of planets) insPlanet.run(r);

                const insUpgrade = db.prepare('INSERT OR REPLACE INTO upgrades (name, power, workforce, superionic_ice, magmatic_gas, startup, icon) VALUES (@name, @power, @workforce, @superionic_ice, @magmatic_gas, @startup, @icon)');
                for (const r of upgrades) insUpgrade.run(r);

                const insAdj = db.prepare('INSERT OR REPLACE INTO system_adjacency (system_id, neighbor_id) VALUES (@system_id, @neighbor_id)');
                for (const r of adjacency) insAdj.run(r);
            })();
        } finally {
            seed.close();
        }
    }
}
