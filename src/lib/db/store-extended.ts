import { randomUUID } from "node:crypto";
import { getDriver } from "./driver";
import { nowIso } from "@/lib/time";
import type { CandidateEvidence, CandidateProfile, DecisionAudit, JobEvaluation, JobPosting } from "@/lib/domain/schemas";
import { candidateEvidenceSchema, candidateProfileSchema, jobEvaluationSchema, jobPostingSchema } from "@/lib/domain/schemas";
import { DEFAULT_CANDIDATE_PROFILE } from "@/lib/domain/defaults";
import type { ApprovalEvent, BrowserSession } from "./store-extended-types";
import type { BrowserTask } from "@/lib/browser/types";
import type { DemoPage } from "@/lib/browser/demo-board";

export type { ApprovalEvent, BrowserSession } from "./store-extended-types";

export async function getCandidateRules(): Promise<CandidateProfile> {
  const db = getDriver();
  const row = await db.get<{ rules_json: string | null; version: number | null }>(
    "SELECT rules_json, version FROM profiles WHERE id = ?",
    ["default"],
  );
  if (!row?.rules_json) return DEFAULT_CANDIDATE_PROFILE;
  try {
    return candidateProfileSchema.parse({
      ...DEFAULT_CANDIDATE_PROFILE,
      ...JSON.parse(row.rules_json),
      version: Number(row.version ?? 1),
    });
  } catch {
    return DEFAULT_CANDIDATE_PROFILE;
  }
}

export async function saveCandidateRules(rules: CandidateProfile): Promise<CandidateProfile> {
  const db = getDriver();
  const parsed = candidateProfileSchema.parse(rules);
  await db.execute("UPDATE profiles SET rules_json = ?, version = ?, updated_at = ? WHERE id = ?", [
    JSON.stringify(parsed),
    parsed.version,
    nowIso(),
    parsed.id,
  ]);
  return parsed;
}

export async function listEvidence(): Promise<CandidateEvidence[]> {
  const db = getDriver();
  const rows = await db.all<{
    id: string;
    candidate_profile_id: string;
    type: string;
    claim: string;
    source_reference: string;
    source_text: string;
    skills_json: string;
    domains_json: string;
    years_of_experience: number | null;
    verified: number | boolean;
    verification_method: string;
  }>("SELECT * FROM candidate_evidence");
  return rows.map((r) =>
    candidateEvidenceSchema.parse({
      id: r.id,
      candidateProfileId: r.candidate_profile_id,
      type: r.type,
      claim: r.claim,
      sourceReference: r.source_reference,
      sourceText: r.source_text,
      skills: JSON.parse(r.skills_json),
      domains: JSON.parse(r.domains_json),
      yearsOfExperience: r.years_of_experience,
      verified: Boolean(r.verified),
      verificationMethod: r.verification_method,
    }),
  );
}

export async function upsertEvidence(item: CandidateEvidence): Promise<CandidateEvidence> {
  const db = getDriver();
  const parsed = candidateEvidenceSchema.parse(item);
  await db.execute("DELETE FROM candidate_evidence WHERE id = ?", [parsed.id]);
  await db.execute(
    `INSERT INTO candidate_evidence
      (id, candidate_profile_id, type, claim, source_reference, source_text, skills_json, domains_json, years_of_experience, verified, verification_method)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      parsed.id,
      parsed.candidateProfileId,
      parsed.type,
      parsed.claim,
      parsed.sourceReference,
      parsed.sourceText,
      JSON.stringify(parsed.skills),
      JSON.stringify(parsed.domains),
      parsed.yearsOfExperience,
      parsed.verified ? 1 : 0,
      parsed.verificationMethod,
    ],
  );
  return parsed;
}

export async function replaceEvidence(items: CandidateEvidence[]): Promise<void> {
  const db = getDriver();
  await db.execute("DELETE FROM candidate_evidence", []);
  for (const item of items) await upsertEvidence(item);
}

export async function saveCanonicalJob(job: JobPosting): Promise<void> {
  const db = getDriver();
  const parsed = jobPostingSchema.parse(job);
  await db.execute(
    "UPDATE opportunities SET canonical_json = ?, extraction_confidence = ?, updated_at = ? WHERE id = ?",
    [JSON.stringify(parsed), parsed.extractionConfidence, parsed.updatedAt, parsed.id],
  );
}

export async function getCanonicalJob(id: string): Promise<JobPosting | null> {
  const db = getDriver();
  const row = await db.get<{ canonical_json: string | null }>("SELECT canonical_json FROM opportunities WHERE id = ?", [id]);
  if (!row?.canonical_json) return null;
  try {
    return jobPostingSchema.parse(JSON.parse(row.canonical_json));
  } catch {
    return null;
  }
}

export async function listCanonicalJobs(): Promise<JobPosting[]> {
  const db = getDriver();
  const rows = await db.all<{ canonical_json: string | null }>("SELECT canonical_json FROM opportunities");
  const out: JobPosting[] = [];
  for (const row of rows) {
    if (!row.canonical_json) continue;
    try {
      out.push(jobPostingSchema.parse(JSON.parse(row.canonical_json)));
    } catch {
      // skip malformed
    }
  }
  return out;
}

export async function insertRawImport(input: { source: string; url: string | null; rawText: string }): Promise<string> {
  const db = getDriver();
  const id = randomUUID();
  await db.execute("INSERT INTO raw_imports (id, source, url, raw_text, created_at) VALUES (?, ?, ?, ?, ?)", [
    id,
    input.source,
    input.url,
    input.rawText,
    nowIso(),
  ]);
  return id;
}

export async function saveJobEvaluationV2(evaluation: JobEvaluation): Promise<void> {
  const db = getDriver();
  const parsed = jobEvaluationSchema.parse(evaluation);
  await db.execute(
    "INSERT INTO job_evaluations_v2 (id, job_id, evaluation_json, created_at) VALUES (?, ?, ?, ?)",
    [parsed.id, parsed.jobId, JSON.stringify(parsed), parsed.evaluatedAt],
  );
}

export async function latestJobEvaluationV2(jobId: string): Promise<JobEvaluation | null> {
  const db = getDriver();
  const row = await db.get<{ evaluation_json: string }>(
    "SELECT evaluation_json FROM job_evaluations_v2 WHERE job_id = ? ORDER BY created_at DESC LIMIT 1",
    [jobId],
  );
  if (!row) return null;
  try {
    return jobEvaluationSchema.parse(JSON.parse(row.evaluation_json));
  } catch {
    return null;
  }
}

export async function listLatestJobEvaluationsV2(): Promise<JobEvaluation[]> {
  const jobs = await listCanonicalJobs();
  const out: JobEvaluation[] = [];
  for (const job of jobs) {
    const ev = await latestJobEvaluationV2(job.id);
    if (ev) out.push(ev);
  }
  return out;
}

export async function insertAudit(partial: Omit<DecisionAudit, "id" | "createdAt">): Promise<DecisionAudit> {
  const db = getDriver();
  const row: DecisionAudit = {
    ...partial,
    id: randomUUID(),
    createdAt: nowIso(),
  };
  await db.execute(
    `INSERT INTO decision_audits
      (id, user_id, job_id, event_type, profile_version, policy_version, model_provider, model_version, input_hash, observation_version, decision_summary_json, policy_result_json, execution_result_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.userId,
      row.jobId,
      row.eventType,
      row.profileVersion,
      row.policyVersion,
      row.modelProvider,
      row.modelVersion,
      row.inputHash,
      row.observationVersion,
      JSON.stringify(row.decisionSummary),
      JSON.stringify(row.policyResult),
      JSON.stringify(row.executionResult),
      row.createdAt,
    ],
  );
  return row;
}

export async function listAudits(limit = 80, jobId?: string): Promise<DecisionAudit[]> {
  const db = getDriver();
  const rows = jobId
    ? await db.all<AuditRow>("SELECT * FROM decision_audits WHERE job_id = ? ORDER BY created_at DESC LIMIT ?", [jobId, limit])
    : await db.all<AuditRow>("SELECT * FROM decision_audits ORDER BY created_at DESC LIMIT ?", [limit]);
  return rows.map(mapAudit);
}

type AuditRow = {
  id: string;
  user_id: string;
  job_id: string | null;
  event_type: string;
  profile_version: number | null;
  policy_version: string | null;
  model_provider: string | null;
  model_version: string | null;
  input_hash: string | null;
  observation_version: string | null;
  decision_summary_json: string;
  policy_result_json: string;
  execution_result_json: string;
  created_at: string;
};

function mapAudit(r: AuditRow): DecisionAudit {
  return {
    id: r.id,
    userId: r.user_id,
    jobId: r.job_id,
    eventType: r.event_type as DecisionAudit["eventType"],
    profileVersion: r.profile_version,
    policyVersion: r.policy_version,
    modelProvider: r.model_provider as DecisionAudit["modelProvider"],
    modelVersion: r.model_version,
    inputHash: r.input_hash,
    observationVersion: r.observation_version,
    decisionSummary: JSON.parse(r.decision_summary_json) as Record<string, unknown>,
    policyResult: JSON.parse(r.policy_result_json) as Record<string, unknown>,
    executionResult: JSON.parse(r.execution_result_json) as Record<string, unknown>,
    createdAt: r.created_at,
  };
}

export async function insertNote(jobId: string, body: string): Promise<void> {
  const db = getDriver();
  await db.execute("INSERT INTO job_notes (id, job_id, body, created_at) VALUES (?, ?, ?, ?)", [
    randomUUID(),
    jobId,
    body,
    nowIso(),
  ]);
}

export async function listNotes(jobId: string): Promise<Array<{ id: string; body: string; createdAt: string }>> {
  const db = getDriver();
  const rows = await db.all<{ id: string; body: string; created_at: string }>(
    "SELECT id, body, created_at FROM job_notes WHERE job_id = ? ORDER BY created_at DESC",
    [jobId],
  );
  return rows.map((r) => ({ id: r.id, body: r.body, createdAt: r.created_at }));
}

export async function insertApproval(input: Omit<ApprovalEvent, "id" | "createdAt">): Promise<ApprovalEvent> {
  const db = getDriver();
  const row: ApprovalEvent = { ...input, id: randomUUID(), createdAt: nowIso() };
  await db.execute(
    "INSERT INTO approval_events (id, session_id, job_id, kind, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [row.id, row.sessionId, row.jobId, row.kind, row.summary, row.createdAt],
  );
  return row;
}

export async function hasApproval(jobId: string, kind: ApprovalEvent["kind"]): Promise<boolean> {
  const db = getDriver();
  const row = await db.get<{ n: number | string }>(
    "SELECT COUNT(*) as n FROM approval_events WHERE job_id = ? AND kind = ?",
    [jobId, kind],
  );
  return Number(row?.n ?? 0) > 0;
}

export async function saveBrowserSession(session: BrowserSession): Promise<void> {
  const db = getDriver();
  await db.execute(
    `INSERT INTO browser_sessions (id, task_json, page_json, status, demo, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET task_json = excluded.task_json, page_json = excluded.page_json, status = excluded.status`,
    [
      session.id,
      JSON.stringify(session.task),
      JSON.stringify(session.page),
      session.status,
      session.demo ? 1 : 0,
      session.createdAt,
    ],
  );
}

export async function getBrowserSession(id: string): Promise<BrowserSession | null> {
  const db = getDriver();
  const row = await db.get<{
    id: string;
    task_json: string;
    page_json: string;
    status: string;
    demo: number | boolean;
    created_at: string;
  }>("SELECT * FROM browser_sessions WHERE id = ?", [id]);
  if (!row) return null;
  return {
    id: row.id,
    task: JSON.parse(row.task_json) as BrowserTask,
    page: JSON.parse(row.page_json) as DemoPage,
    status: row.status as BrowserSession["status"],
    demo: Boolean(row.demo),
    createdAt: row.created_at,
  };
}

export async function enqueueWork(kind: string, payload: Record<string, unknown>): Promise<string> {
  const db = getDriver();
  const id = randomUUID();
  const ts = nowIso();
  await db.execute(
    "INSERT INTO work_queue (id, kind, payload_json, status, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, kind, JSON.stringify(payload), "pending", null, ts, ts],
  );
  return id;
}

export async function completeWork(id: string, error?: string): Promise<void> {
  const db = getDriver();
  await db.execute("UPDATE work_queue SET status = ?, error = ?, updated_at = ? WHERE id = ?", [
    error ? "failed" : "done",
    error ?? null,
    nowIso(),
    id,
  ]);
}
