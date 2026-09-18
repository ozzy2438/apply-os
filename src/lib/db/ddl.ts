export const DDL = [
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    goals TEXT NOT NULL,
    constraints_json TEXT NOT NULL,
    weights_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cv_bullets (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    kind TEXT NOT NULL,
    sort_order INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT NOT NULL,
    compensation TEXT,
    url TEXT,
    raw_text TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS evaluations (
    id TEXT PRIMARY KEY,
    opportunity_id TEXT NOT NULL,
    model TEXT NOT NULL,
    demo INTEGER NOT NULL,
    answers_json TEXT NOT NULL,
    composed_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cover_letters (
    id TEXT PRIMARY KEY,
    opportunity_id TEXT NOT NULL,
    body TEXT NOT NULL,
    claims_json TEXT NOT NULL,
    check_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS briefings (
    brief_date TEXT PRIMARY KEY,
    opportunity_ids_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS status_events (
    id TEXT PRIMARY KEY,
    opportunity_id TEXT NOT NULL,
    status TEXT NOT NULL,
    note TEXT,
    at TEXT NOT NULL
  )`,
];
