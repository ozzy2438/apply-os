import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDriver } from "@/lib/db/driver";
import { nowIso } from "@/lib/time";
import type { GuardResult, HumanApproval, LayoutReceipt, ResumeDraft, ResumePlan, ReviewResult, StudioResult } from "./types";

export type ResumeIntent = "build" | "self" | "existing" | "skip";

export type ResumeRunRecord = {
  id: string;
  jobId: string;
  tenantId: string;
  candidateId: string;
  idempotencyKey: string;
  status: StudioResult["status"] | "READY" | "SKIPPED" | "SELF_PREPARE" | "EXISTING_REVIEWED";
  intent: ResumeIntent;
  snapshot: ResumeRunSnapshot;
  draftHash: string | null;
  artifactHash: string | null;
  profileHash: string;
  decisionPolicyHash: string;
  resumePolicyHash: string;
  writerMode: string | null;
  writerRevision: string | null;
  reviewerMode: string | null;
  reviewerRevision: string | null;
  usage: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ResumeRunSnapshot = {
  plan: ResumePlan | null;
  draft: ResumeDraft | null;
  guard: GuardResult | null;
  review: ReviewResult | null;
  layout: LayoutReceipt | null;
  renderedText: string | null;
  renderedHtml: string | null;
  warnings: string[];
  pendingReview: Array<{ id: string; reason: string }>;
  generation: StudioResult["generation"] | null;
  roleFit: number | null;
  resumeReadiness: number | null;
  reviewLabel: string | null;
  approval: HumanApproval | null;
  existingReview?: { claimVerification: "NOT_RUN"; canMarkReady: false };
};

function artifactDir(): string {
  return path.join(process.cwd(), ".data", "resumes");
}

export function artifactPath(runId: string): string {
  return path.join(artifactDir(), `${runId}.pdf`);
}

export function saveResumeArtifact(runId: string, bytes: Buffer): void {
  mkdirSync(artifactDir(), { recursive: true });
  writeFileSync(artifactPath(runId), bytes);
}

export function loadResumeArtifact(runId: string): Buffer | null {
  const file = artifactPath(runId);
  return existsSync(file) ? readFileSync(file) : null;
}

type Row = {
  id: string;
  job_id: string;
  tenant_id: string;
  candidate_id: string;
  idempotency_key: string;
  status: string;
  intent: string;
  snapshot_json: string;
  draft_hash: string | null;
  artifact_hash: string | null;
  profile_hash: string;
  decision_policy_hash: string;
  resume_policy_hash: string;
  writer_mode: string | null;
  writer_revision: string | null;
  reviewer_mode: string | null;
  reviewer_revision: string | null;
  usage_json: string | null;
  created_at: string;
  updated_at: string;
};

function mapRun(row: Row): ResumeRunRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    tenantId: row.tenant_id,
    candidateId: row.candidate_id,
    idempotencyKey: row.idempotency_key,
    status: row.status as ResumeRunRecord["status"],
    intent: row.intent as ResumeIntent,
    snapshot: JSON.parse(row.snapshot_json) as ResumeRunSnapshot,
    draftHash: row.draft_hash,
    artifactHash: row.artifact_hash,
    profileHash: row.profile_hash,
    decisionPolicyHash: row.decision_policy_hash,
    resumePolicyHash: row.resume_policy_hash,
    writerMode: row.writer_mode,
    writerRevision: row.writer_revision,
    reviewerMode: row.reviewer_mode,
    reviewerRevision: row.reviewer_revision,
    usage: row.usage_json ? JSON.parse(row.usage_json) : "unknown",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertResumeRun(input: Omit<ResumeRunRecord, "id" | "createdAt" | "updatedAt">): Promise<ResumeRunRecord> {
  const db = getDriver();
  const existing = await db.get<Row>("SELECT * FROM resume_runs WHERE idempotency_key = ?", [input.idempotencyKey]);
  if (existing) return mapRun(existing);
  const row: ResumeRunRecord = {
    ...input,
    id: randomUUID(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  try {
    await db.execute(
      `INSERT INTO resume_runs (
        id, job_id, tenant_id, candidate_id, idempotency_key, status, intent, snapshot_json,
        draft_hash, artifact_hash, profile_hash, decision_policy_hash, resume_policy_hash,
        writer_mode, writer_revision, reviewer_mode, reviewer_revision, usage_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.jobId,
        row.tenantId,
        row.candidateId,
        row.idempotencyKey,
        row.status,
        row.intent,
        JSON.stringify(row.snapshot),
        row.draftHash,
        row.artifactHash,
        row.profileHash,
        row.decisionPolicyHash,
        row.resumePolicyHash,
        row.writerMode,
        row.writerRevision,
        row.reviewerMode,
        row.reviewerRevision,
        JSON.stringify(row.usage ?? "unknown"),
        row.createdAt,
        row.updatedAt,
      ],
    );
    return row;
  } catch {
    const raced = await db.get<Row>("SELECT * FROM resume_runs WHERE idempotency_key = ?", [input.idempotencyKey]);
    if (raced) return mapRun(raced);
    throw new Error("RESUME_RUN_INSERT_FAILED");
  }
}

export async function latestResumeRun(jobId: string): Promise<ResumeRunRecord | null> {
  const db = getDriver();
  const row = await db.get<Row>("SELECT * FROM resume_runs WHERE job_id = ? ORDER BY created_at DESC LIMIT 1", [jobId]);
  return row ? mapRun(row) : null;
}

export async function getResumeRun(id: string): Promise<ResumeRunRecord | null> {
  const db = getDriver();
  const row = await db.get<Row>("SELECT * FROM resume_runs WHERE id = ?", [id]);
  return row ? mapRun(row) : null;
}

export async function casApproveResume(input: {
  id: string;
  draftHash: string;
  artifactHash: string;
  approval: HumanApproval;
}): Promise<boolean> {
  const db = getDriver();
  const current = await getResumeRun(input.id);
  if (!current) return false;
  if (current.draftHash !== input.draftHash || current.artifactHash !== input.artifactHash) return false;
  if (current.status === "READY") return current.snapshot.approval?.artifactHash === input.artifactHash;
  const snapshot = { ...current.snapshot, approval: input.approval };
  await db.execute(
    `UPDATE resume_runs SET status = ?, snapshot_json = ?, updated_at = ?
     WHERE id = ? AND draft_hash = ? AND artifact_hash = ? AND status != ?`,
    [ "READY", JSON.stringify(snapshot), nowIso(), input.id, input.draftHash, input.artifactHash, "READY"],
  );
  const next = await getResumeRun(input.id);
  return next?.status === "READY";
}
