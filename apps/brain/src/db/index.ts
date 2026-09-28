import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { config } from "../config.ts";

const SCHEMA = /* sql */ `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

-- Gmail message ids already fetched, so an interrupted sync resumes where it stopped.
CREATE TABLE IF NOT EXISTS gmail_seen (
  account_id TEXT NOT NULL, message_id TEXT NOT NULL,
  PRIMARY KEY (account_id, message_id)
);

-- Connected accounts (one row per Google account, X account, ...).
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  email TEXT,
  tokens TEXT,
  sync_state TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A resolved human. Core fields are rebuilt from observations + enrichment.
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  first_name TEXT, last_name TEXT,
  headline TEXT, title TEXT, company TEXT,
  city TEXT, region TEXT, country TEXT,
  photo_url TEXT, linkedin_url TEXT, x_handle TEXT,
  summary TEXT,
  is_me INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  strength REAL NOT NULL DEFAULT 0,
  tier TEXT, trend TEXT,
  strength_detail TEXT,
  first_interaction_at TEXT, last_interaction_at TEXT,
  interaction_count INTEGER NOT NULL DEFAULT 0,
  doc TEXT, doc_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS people_strength ON people(strength DESC);

-- Strong identifiers that resolve to exactly one person: email, phone, linkedin slug, x_id, x_handle.
CREATE TABLE IF NOT EXISTS identifiers (
  kind TEXT NOT NULL, value TEXT NOT NULL,
  person_id TEXT NOT NULL, source TEXT NOT NULL,
  PRIMARY KEY (kind, value)
);
CREATE INDEX IF NOT EXISTS identifiers_person ON identifiers(person_id);

-- Raw per-source profile records (a contact card, a LinkedIn connection row, ...).
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL, account_id TEXT NOT NULL DEFAULT '', external_id TEXT NOT NULL,
  person_id TEXT,
  data TEXT NOT NULL,
  observed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source, account_id, external_id)
);
CREATE INDEX IF NOT EXISTS observations_person ON observations(person_id);

-- Every touchpoint: email, meeting, DM, community post, connection, follow.
CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL, account_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'none', -- out | in | mutual | none (relative to me)
  subject TEXT, snippet TEXT, thread_id TEXT, url TEXT,
  is_bulk INTEGER NOT NULL DEFAULT 0,
  community_id TEXT,
  meta TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS interactions_time ON interactions(occurred_at);
CREATE INDEX IF NOT EXISTS interactions_thread ON interactions(thread_id);

CREATE TABLE IF NOT EXISTS participants (
  interaction_id TEXT NOT NULL,
  handle_kind TEXT NOT NULL, handle TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL,
  person_id TEXT,
  PRIMARY KEY (interaction_id, handle_kind, handle, role)
);
CREATE INDEX IF NOT EXISTS participants_handle ON participants(handle_kind, handle);
CREATE INDEX IF NOT EXISTS participants_person ON participants(person_id);

CREATE TABLE IF NOT EXISTS employment (
  id INTEGER PRIMARY KEY,
  person_id TEXT NOT NULL,
  company TEXT NOT NULL, company_key TEXT NOT NULL, company_domain TEXT,
  title TEXT, start_date TEXT, end_date TEXT,
  is_current INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS employment_person ON employment(person_id);
CREATE INDEX IF NOT EXISTS employment_company ON employment(company_key);

-- Companies are resolved from jobs: by web domain first, then alias/normalized name.
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL,
  domain TEXT,
  linkedin_url TEXT, industry TEXT, size TEXT, employee_count INTEGER,
  city TEXT, region TEXT, country TEXT, founded INTEGER,
  funding_stage TEXT, description TEXT, tags TEXT,
  enrich_status TEXT, enriched_at TEXT
);
-- kind = 'key' (normalized name) or 'domain'.
CREATE TABLE IF NOT EXISTS company_aliases (
  kind TEXT NOT NULL, value TEXT NOT NULL, company_id TEXT NOT NULL, source TEXT NOT NULL,
  PRIMARY KEY (kind, value)
);
CREATE INDEX IF NOT EXISTS company_aliases_company ON company_aliases(company_id);

CREATE TABLE IF NOT EXISTS education (
  id INTEGER PRIMARY KEY,
  person_id TEXT NOT NULL,
  school TEXT NOT NULL, school_key TEXT NOT NULL,
  degree TEXT, start_date TEXT, end_date TEXT,
  source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS education_person ON education(person_id);

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_id TEXT,
  url TEXT, description TEXT
);
CREATE TABLE IF NOT EXISTS memberships (
  community_id TEXT NOT NULL, person_id TEXT NOT NULL,
  role TEXT, source TEXT NOT NULL,
  PRIMARY KEY (community_id, person_id)
);
CREATE INDEX IF NOT EXISTS memberships_person ON memberships(person_id);

-- Derived person<->person links with evidence (a < b).
CREATE TABLE IF NOT EXISTS edges (
  a TEXT NOT NULL, b TEXT NOT NULL, kind TEXT NOT NULL,
  weight REAL NOT NULL, evidence TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (a, b, kind)
);
CREATE INDEX IF NOT EXISTS edges_b ON edges(b);

CREATE TABLE IF NOT EXISTS enrichments (
  person_id TEXT NOT NULL, provider TEXT NOT NULL,
  status TEXT NOT NULL, fetched_at TEXT NOT NULL,
  data TEXT, raw TEXT,
  PRIMARY KEY (person_id, provider)
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY,
  person_id TEXT NOT NULL, body TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS embeddings (
  person_id TEXT PRIMARY KEY, model TEXT NOT NULL, doc_hash TEXT NOT NULL, vector BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS merges (
  from_id TEXT NOT NULL, into_id TEXT NOT NULL, reason TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS people_fts USING fts5(
  person_id UNINDEXED, name, headline, orgs, places, communities, doc,
  tokenize = 'porter unicode61 remove_diacritics 2'
);
CREATE VIRTUAL TABLE IF NOT EXISTS activity_fts USING fts5(
  interaction_id UNINDEXED, subject, body,
  tokenize = 'porter unicode61 remove_diacritics 2'
);
`;

/** Additive migrations for databases created by earlier versions. */
function migrate(d: DatabaseSync) {
  const cols = (table: string) =>
    (d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (c) => c.name,
    );
  if (!cols("employment").includes("company_id")) {
    d.exec("ALTER TABLE employment ADD COLUMN company_id TEXT");
  }
  d.exec(
    "CREATE INDEX IF NOT EXISTS employment_company_id ON employment(company_id)",
  );
}

let instance: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (!instance) {
    instance = new DatabaseSync(config.dbPath);
    // Wait for another writer (web server, a second sync) instead of failing at once.
    instance.exec("PRAGMA busy_timeout = 30000;");
    instance.exec(SCHEMA);
    migrate(instance);
  }
  return instance;
}

export type Row = Record<string, SQLInputValue>;

export const all = <T = Row>(sql: string, ...params: SQLInputValue[]) =>
  db()
    .prepare(sql)
    .all(...params) as T[];
export const get = <T = Row>(sql: string, ...params: SQLInputValue[]) =>
  db()
    .prepare(sql)
    .get(...params) as T | undefined;
export const run = (sql: string, ...params: SQLInputValue[]) =>
  db()
    .prepare(sql)
    .run(...params);

export function tx<T>(fn: () => T): T {
  const d = db();
  if (d.isTransaction) return fn();
  d.exec("BEGIN");
  try {
    const result = fn();
    d.exec("COMMIT");
    return result;
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }
}

export function getMeta(key: string): string | undefined {
  return get<{ value: string }>("SELECT value FROM meta WHERE key = ?", key)
    ?.value;
}
export function setMeta(key: string, value: string) {
  run(
    "INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}

export function closeDb() {
  instance?.close();
  instance = null;
}
