export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ===== SDE-derived tables =====

CREATE TABLE IF NOT EXISTS regions (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  faction_id  INTEGER,
  map_svg     TEXT
);

CREATE TABLE IF NOT EXISTS constellations (
  id          INTEGER PRIMARY KEY,
  region_id   INTEGER NOT NULL REFERENCES regions(id),
  name        TEXT NOT NULL,
  faction_id  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_constellations_region ON constellations(region_id);

CREATE TABLE IF NOT EXISTS systems (
  id                INTEGER PRIMARY KEY,
  constellation_id  INTEGER NOT NULL REFERENCES constellations(id),
  region_id         INTEGER NOT NULL REFERENCES regions(id),
  name              TEXT NOT NULL,
  security_status   REAL,
  security_class    TEXT,
  x                 REAL DEFAULT NULL,
  y                 REAL DEFAULT NULL,
  z                 REAL DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_systems_constellation ON systems(constellation_id);
CREATE INDEX IF NOT EXISTS idx_systems_region        ON systems(region_id);
CREATE INDEX IF NOT EXISTS idx_systems_name          ON systems(name);

-- ===== Sov-data tables (refreshable from CSVs) =====

CREATE TABLE IF NOT EXISTS stars (
  id              INTEGER PRIMARY KEY,
  system_id       INTEGER NOT NULL UNIQUE REFERENCES systems(id),
  spectral_class  TEXT,
  description     TEXT,
  power           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS planets (
  id                       INTEGER PRIMARY KEY,
  system_id                INTEGER NOT NULL REFERENCES systems(id),
  name                     TEXT NOT NULL,
  power                    INTEGER NOT NULL DEFAULT 0,
  workforce                INTEGER NOT NULL DEFAULT 0,
  superionic_ice_per_hour  INTEGER NOT NULL DEFAULT 0,
  magmatic_gas_per_hour    INTEGER NOT NULL DEFAULT 0,
  planet_type              TEXT
);
CREATE INDEX IF NOT EXISTS idx_planets_system ON planets(system_id);

CREATE TABLE IF NOT EXISTS upgrades (
  name             TEXT PRIMARY KEY,
  power            INTEGER NOT NULL,
  workforce        INTEGER NOT NULL,
  superionic_ice   INTEGER NOT NULL,
  magmatic_gas     INTEGER NOT NULL,
  startup          INTEGER NOT NULL,
  icon             BLOB
);

-- ===== Plan tables (user-mutable) =====

CREATE TABLE IF NOT EXISTS plans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  read_only   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plan_scopes (
  plan_id     INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  scope_type  TEXT NOT NULL CHECK (scope_type IN ('region','constellation','system')),
  scope_id    INTEGER NOT NULL,
  PRIMARY KEY (plan_id, scope_type, scope_id)
);

CREATE TABLE IF NOT EXISTS plan_upgrades (
  plan_id       INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  system_id     INTEGER NOT NULL REFERENCES systems(id),
  upgrade_name  TEXT    NOT NULL REFERENCES upgrades(name),
  ordering      INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  installed     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (plan_id, system_id, upgrade_name)
);

CREATE TABLE IF NOT EXISTS preferences (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- One row per (plan, system) marked as the plan's capital. Schema permits many
-- per plan; the renderer enforces one-capital-per-plan when setting.
CREATE TABLE IF NOT EXISTS plan_capital_systems (
  plan_id    INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  system_id  INTEGER NOT NULL REFERENCES systems(id),
  PRIMARY KEY (plan_id, system_id)
);

-- ALN jump bridge links: one target system per (plan, source system).
-- linked_system_id is nullable because manual cross-alliance entries may not exist in the local DB.
CREATE TABLE IF NOT EXISTS plan_aln_links (
  plan_id             INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  system_id           INTEGER NOT NULL REFERENCES systems(id),
  linked_system_id    INTEGER,
  linked_system_name  TEXT    NOT NULL,
  PRIMARY KEY (plan_id, system_id)
);

-- Per-plan workforce status for a system: local (default, no row), import, export, transit.
CREATE TABLE IF NOT EXISTS plan_system_status (
  plan_id               INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  system_id             INTEGER NOT NULL REFERENCES systems(id),
  status                TEXT    NOT NULL CHECK (status IN ('local','import','export','transit')),
  transfer_amount       INTEGER NOT NULL DEFAULT 0,
  destination_system_id INTEGER,
  export_all_unused     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (plan_id, system_id)
);

-- Stargate adjacency (symmetric): populated from mapStargates.jsonl during seeding.
CREATE TABLE IF NOT EXISTS system_adjacency (
  system_id   INTEGER NOT NULL REFERENCES systems(id),
  neighbor_id INTEGER NOT NULL REFERENCES systems(id),
  PRIMARY KEY (system_id, neighbor_id)
);
CREATE INDEX IF NOT EXISTS idx_adjacency_system   ON system_adjacency(system_id);
CREATE INDEX IF NOT EXISTS idx_adjacency_neighbor ON system_adjacency(neighbor_id);

-- Upwell structures planned for deployment within a plan.
CREATE TABLE IF NOT EXISTS plan_structures (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id        INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  system_id      INTEGER NOT NULL REFERENCES systems(id),
  structure_type TEXT NOT NULL,
  name           TEXT,
  location       TEXT,
  moon_id        INTEGER,
  notes          TEXT,
  source         TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS idx_plan_structures_system
  ON plan_structures(plan_id, system_id);

-- ===== Exports =====

CREATE TABLE IF NOT EXISTS export_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id       INTEGER REFERENCES plans(id) ON DELETE SET NULL,
  plan_name     TEXT    NOT NULL,
  export_type   TEXT    NOT NULL,
  panel         TEXT,
  system_name   TEXT,
  filename      TEXT,
  opsec_preset  TEXT,
  exported_at   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_export_log_plan ON export_log(plan_id, exported_at DESC);

CREATE TABLE IF NOT EXISTS export_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ===== Moon scans =====

CREATE TABLE IF NOT EXISTS moon_scan_sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  imported_at  TEXT NOT NULL,
  system_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS moon_scans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER REFERENCES moon_scan_sessions(id) ON DELETE CASCADE,
  system_id   INTEGER NOT NULL REFERENCES systems(id),
  moon_number INTEGER NOT NULL,
  planet_name TEXT,
  ore_type    TEXT NOT NULL,
  ore_percent REAL NOT NULL,
  scan_date   TEXT,
  UNIQUE(system_id, moon_number, ore_type)
);
CREATE INDEX IF NOT EXISTS idx_moon_scans_system ON moon_scans(system_id);

-- ===== Views =====

DROP VIEW IF EXISTS system_budget;
CREATE VIEW system_budget AS
SELECT
  s.id              AS system_id,
  s.name            AS system_name,
  s.constellation_id,
  s.region_id,
  COALESCE(st.power, 0)
    + COALESCE((SELECT SUM(power)                  FROM planets p WHERE p.system_id = s.id), 0)  AS available_power,
  COALESCE((SELECT SUM(workforce)                  FROM planets p WHERE p.system_id = s.id), 0)  AS available_workforce,
  COALESCE((SELECT SUM(superionic_ice_per_hour)    FROM planets p WHERE p.system_id = s.id), 0)  AS available_ice,
  COALESCE((SELECT SUM(magmatic_gas_per_hour)      FROM planets p WHERE p.system_id = s.id), 0)  AS available_gas,
  CASE WHEN st.description IS NOT NULL THEN 1 ELSE 0 END                                          AS sov_eligible
FROM systems s
LEFT JOIN stars st ON st.system_id = s.id;
`;
