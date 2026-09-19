import type { SqlDriver } from "./driver";

export const DDL_V2 = [
  `CREATE TABLE IF NOT EXISTS candidate_evidence (
    id TEXT PRIMARY KEY,
    candidate_profile_id TEXT NOT NULL,
    type TEXT NOT NULL,
    claim TEXT NOT NULL,
    source_reference TEXT NOT NULL,
    source_text TEXT NOT NULL,
    skills_json TEXT NOT NULL,
    domains_json TEXT NOT NULL,
    years_of_experience REAL,
    verified INTEGER NOT NULL,
    verification_method TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS decision_audits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    job_id TEXT,
    event_type TEXT NOT NULL,
    profile_version INTEGER,
    policy_version TEXT,
    model_provider TEXT,
    model_version TEXT,
    input_hash TEXT,
    observation_version TEXT,
    decision_summary_json TEXT NOT NULL,
    policy_result_json TEXT NOT NULL,
    execution_result_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS browser_sessions (
    id TEXT PRIMARY KEY,
    task_json TEXT NOT NULL,
    page_json TEXT NOT NULL,
    status TEXT NOT NULL,
    demo INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS approval_events (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    job_id TEXT,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS job_notes (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS work_queue (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS raw_imports (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    url TEXT,
    raw_text TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS job_evaluations_v2 (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    evaluation_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS resume_runs (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    intent TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    draft_hash TEXT,
    artifact_hash TEXT,
    profile_hash TEXT NOT NULL,
    decision_policy_hash TEXT NOT NULL,
    resume_policy_hash TEXT NOT NULL,
    writer_mode TEXT,
    writer_revision TEXT,
    reviewer_mode TEXT,
    reviewer_revision TEXT,
    usage_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
];

export const ALTERS = [
  "ALTER TABLE opportunities ADD COLUMN canonical_json TEXT",
  "ALTER TABLE opportunities ADD COLUMN extraction_confidence REAL",
  "ALTER TABLE opportunities ADD COLUMN updated_at TEXT",
  "ALTER TABLE profiles ADD COLUMN version INTEGER",
  "ALTER TABLE profiles ADD COLUMN rules_json TEXT",
];

export async function migrate(db: SqlDriver): Promise<void> {
  for (const stmt of DDL_V2) {
    await db.execute(stmt);
  }
  for (const stmt of ALTERS) {
    try {
      await db.execute(stmt);
    } catch {
      // column already exists on upgraded V1 databases
    }
  }
}
