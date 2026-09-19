import { getOpportunity } from "@/lib/db/store";
import { getCandidateRules, getCanonicalJob, insertApproval, insertAudit, latestJobEvaluationV2 } from "@/lib/db/store-extended";
import { normalizeJobPosting } from "@/lib/ingest/normalize";
import { POLICY_VERSION } from "@/lib/policy/version";
import { PROFILE_VERSION_NUMBER } from "@/lib/canonical/types";
import type { JobPosting } from "@/lib/domain/schemas";
import { buildResume } from "./pipeline";
import { makePlan } from "./planner";
import { guardDraft, proposeRewrite, selectedClaimIds } from "./guard";
import { templateDraft } from "./writer";
import { renderResume } from "./render";
import { canMarkReady } from "./readiness";
import { reviewExistingText } from "./jev-adapter";
import { buildResumeContext, DEFAULT_CANDIDATE_ID, DEFAULT_TENANT_ID, decisionPolicySnapshotHash, profileSnapshotHash } from "./context";
import { createResumeJevRunner, createResumeReviewer, createResumeWriter, reviewModeLabel } from "./host";
import { dropLeastRelevantBullet, renderMeasuredPdf } from "./pdf";
import { loadResumePolicy, resumePolicyHash, WRITER_PROMPT_VERSION } from "./policy";
import { hash } from "./identity";
import { resumeStudioEnabled } from "./flags";
import { redactExistingResume } from "./redact";
import {
  casApproveResume,
  insertResumeRun,
  latestResumeRun,
  loadResumeArtifact,
  saveResumeArtifact,
  type ResumeIntent,
  type ResumeRunRecord,
  type ResumeRunSnapshot,
} from "./persist";
import type { HumanApproval, ResumeContext, ResumeDraft, RewriteProposal } from "./types";

export class ResumeAccessError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "ResumeAccessError";
  }
}

async function requireJob(jobId: string, tenantId = DEFAULT_TENANT_ID): Promise<{ opportunityId: string; job: JobPosting }> {
  if (tenantId !== DEFAULT_TENANT_ID) throw new ResumeAccessError("CROSS_TENANT");
  const opportunity = await getOpportunity(jobId);
  if (!opportunity) throw new ResumeAccessError("JOB_NOT_FOUND");
  const canonical = await getCanonicalJob(jobId);
  const job =
    canonical ??
    normalizeJobPosting({
      id: opportunity.id,
      rawText: `${opportunity.title}\n${opportunity.company}\n${opportunity.location}\n${opportunity.rawText}`,
      url: opportunity.url,
    });
  return { opportunityId: opportunity.id, job };
}

function buildKey(input: {
  tenantId: string;
  candidateId: string;
  jobId: string;
  profileHash: string;
  decisionPolicyHash: string;
  resumePolicyHash: string;
  writerRevision: string;
  intent: ResumeIntent;
}): string {
  return hash({ ...input, promptVersion: WRITER_PROMPT_VERSION });
}

async function audit(jobId: string, eventType: "RESUME_BUILT" | "RESUME_APPROVED" | "RESUME_EXISTING_REVIEWED" | "RESUME_INTENT", summary: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  await insertAudit({
    userId: DEFAULT_CANDIDATE_ID,
    jobId,
    eventType,
    profileVersion: (await getCandidateRules()).version ?? PROFILE_VERSION_NUMBER,
    policyVersion: POLICY_VERSION,
    modelProvider: extra.modelProvider as "JEV" | "OPENAI" | "DEMO" | null ?? null,
    modelVersion: (extra.modelVersion as string | null) ?? null,
    inputHash: (extra.inputHash as string | null) ?? null,
    observationVersion: null,
    decisionSummary: summary,
    policyResult: { resumeStudio: true },
    executionResult: (extra.execution as Record<string, unknown> | undefined) ?? {},
  });
}

export async function recordResumeIntent(jobId: string, intent: Exclude<ResumeIntent, "build">): Promise<ResumeRunRecord> {
  if (!resumeStudioEnabled()) throw new ResumeAccessError("RESUME_STUDIO_DISABLED");
  const { job } = await requireJob(jobId);
  const profileHash = profileSnapshotHash();
  const decisionPolicyHash = decisionPolicySnapshotHash();
  const { policy } = loadResumePolicy("data_analytics_insights");
  const status = intent === "skip" ? "SKIPPED" : intent === "self" ? "SELF_PREPARE" : "EXISTING_REVIEWED";
  const run = await insertResumeRun({
    jobId: job.id,
    tenantId: DEFAULT_TENANT_ID,
    candidateId: DEFAULT_CANDIDATE_ID,
    idempotencyKey: buildKey({
      tenantId: DEFAULT_TENANT_ID,
      candidateId: DEFAULT_CANDIDATE_ID,
      jobId: job.id,
      profileHash,
      decisionPolicyHash,
      resumePolicyHash: resumePolicyHash(policy),
      writerRevision: "none",
      intent,
    }),
    status,
    intent,
    snapshot: {
      plan: null,
      draft: null,
      guard: null,
      review: null,
      layout: null,
      renderedText: null,
      renderedHtml: null,
      warnings: [],
      pendingReview: [],
      generation: null,
      roleFit: null,
      resumeReadiness: null,
      reviewLabel: null,
      approval: null,
    },
    draftHash: null,
    artifactHash: null,
    profileHash,
    decisionPolicyHash,
    resumePolicyHash: resumePolicyHash(policy),
    writerMode: null,
    writerRevision: null,
    reviewerMode: null,
    reviewerRevision: null,
    usage: "unknown",
  });
  await audit(job.id, "RESUME_INTENT", { intent, status: run.status });
  return run;
}

export async function buildResumeForJob(jobId: string, userRequested: boolean): Promise<ResumeRunRecord> {
  if (!resumeStudioEnabled()) throw new ResumeAccessError("RESUME_STUDIO_DISABLED");
  if (!userRequested) throw new ResumeAccessError("USER_BUILD_REQUEST_REQUIRED");
  const { job } = await requireJob(jobId);
  const { context, pendingReview, roleFamilyId } = buildResumeContext({ job });
  const { policy, warnings: policyWarnings } = loadResumePolicy(roleFamilyId);
  const writer = createResumeWriter(context, makePlan(context, policy), policy);
  const idempotencyKey = buildKey({
    tenantId: context.scope.tenantId,
    candidateId: context.scope.candidateId,
    jobId: context.scope.jobId,
    profileHash: context.scope.profileHash,
    decisionPolicyHash: context.scope.decisionPolicyHash,
    resumePolicyHash: resumePolicyHash(policy),
    writerRevision: writer.revision,
    intent: "build",
  });
  const existing = await latestResumeRun(job.id);
  if (existing && existing.idempotencyKey === idempotencyKey && existing.intent === "build") {
    return existing;
  }

  const reviewer = createResumeReviewer(policy);
  const result = await buildResume({
    context,
    policy,
    userRequested: true,
    writer,
    reviewer,
  });

  let draft = result.draft;
  let guard = result.guard;
  const review = result.review;
  const warnings = [...policyWarnings, ...result.warnings, ...pendingReview.slice(0, 8).map((p) => `${p.id}: ${p.reason}`)];
  let rendered = draft && guard?.passed ? renderResume(context, result.plan, draft, policy) : null;
  let measured = rendered
    ? renderMeasuredPdf({ rendered, minFontSizePt: policy.minFontSizePt, expectedPages: policy.expectedPages })
    : null;

  if (draft && measured && (measured.receipt.pageCount > policy.expectedPages || measured.receipt.clippedContent)) {
    const trimmed = dropLeastRelevantBullet(draft);
    if (trimmed) {
      const nextGuard = guardDraft(context, result.plan, trimmed, policy);
      if (nextGuard.passed) {
        const nextRendered = renderResume(context, result.plan, trimmed, policy);
        const nextMeasured = renderMeasuredPdf({
          rendered: nextRendered,
          minFontSizePt: policy.minFontSizePt,
          expectedPages: policy.expectedPages,
        });
        if (
          nextMeasured.receipt.pageCount <= (measured.receipt.pageCount) &&
          nextGuard.warnings.length <= (guard?.warnings.length ?? 99)
        ) {
          draft = trimmed;
          guard = nextGuard;
          rendered = nextRendered;
          measured = nextMeasured;
          warnings.push("Dropped the least relevant whole bullet so the measured one-page export could fit. Qualifiers were not stripped.");
        }
      }
    }
  }

  const evaluation = await latestJobEvaluationV2(job.id);
  const snapshot: ResumeRunSnapshot = {
    plan: result.plan,
    draft,
    guard,
    review,
    layout: measured?.receipt ?? null,
    renderedText: rendered?.text ?? null,
    renderedHtml: rendered?.html ?? null,
    warnings,
    pendingReview,
    generation: result.generation,
    roleFit: evaluation?.roleFit ?? evaluation?.semanticSignals.roleFitScore ?? null,
    resumeReadiness: review?.readinessScore ?? null,
    reviewLabel: reviewModeLabel(review, result.generation.mode),
    approval: null,
  };

  const run = await insertResumeRun({
    jobId: job.id,
    tenantId: context.scope.tenantId,
    candidateId: context.scope.candidateId,
    idempotencyKey,
    status: result.status,
    intent: "build",
    snapshot,
    draftHash: guard?.draftHash ?? null,
    artifactHash: measured?.receipt.artifactHash ?? null,
    profileHash: context.scope.profileHash,
    decisionPolicyHash: context.scope.decisionPolicyHash,
    resumePolicyHash: resumePolicyHash(policy),
    writerMode: result.generation.mode,
    writerRevision: result.generation.writerRevision,
    reviewerMode: review?.mode ?? null,
    reviewerRevision: review?.resolvedModel ?? review?.requestedModel ?? null,
    usage: "unknown",
  });
  if (measured) saveResumeArtifact(run.id, measured.bytes);
  await audit(
    job.id,
    "RESUME_BUILT",
    {
      status: run.status,
      draftHash: run.draftHash,
      artifactHash: run.artifactHash,
      writerMode: run.writerMode,
      reviewLabel: snapshot.reviewLabel,
      pendingClaims: pendingReview.length,
    },
    {
      modelProvider: reviewer ? "JEV" : result.generation.mode === "live" ? "OPENAI" : "DEMO",
      modelVersion: run.writerRevision,
      inputHash: result.plan.contextHash,
    },
  );
  return (await latestResumeRun(job.id)) ?? run;
}

export async function approveResumeForJob(jobId: string, acceptedWarnings: boolean): Promise<{ ready: boolean; reasons: string[] }> {
  if (!resumeStudioEnabled()) throw new ResumeAccessError("RESUME_STUDIO_DISABLED");
  const { job } = await requireJob(jobId);
  const run = await latestResumeRun(job.id);
  if (!run?.snapshot.plan || !run.snapshot.draft || !run.snapshot.review || !run.snapshot.layout) {
    return { ready: false, reasons: ["NO_CURRENT_RESUME_RUN"] };
  }
  const { context, roleFamilyId } = buildResumeContext({ job });
  const { policy } = loadResumePolicy(roleFamilyId);
  if (
    context.scope.profileHash !== run.profileHash ||
    context.scope.decisionPolicyHash !== run.decisionPolicyHash ||
    resumePolicyHash(policy) !== run.resumePolicyHash
  ) {
    return { ready: false, reasons: ["STALE_SOURCE_SNAPSHOT"] };
  }
  const approval: HumanApproval = {
    actorId: DEFAULT_CANDIDATE_ID,
    tenantId: context.scope.tenantId,
    candidateId: context.scope.candidateId,
    draftHash: run.draftHash ?? "",
    artifactHash: run.artifactHash ?? "",
    approvedAt: new Date().toISOString(),
    acceptedWarnings,
  };
  const gate = canMarkReady({
    context,
    plan: run.snapshot.plan,
    draft: run.snapshot.draft,
    policy,
    review: run.snapshot.review,
    layout: run.snapshot.layout,
    approval,
  });
  if (!gate.ready) return gate;
  const ok = await casApproveResume({
    id: run.id,
    draftHash: approval.draftHash,
    artifactHash: approval.artifactHash,
    approval,
  });
  if (!ok) return { ready: false, reasons: ["STALE_OR_RACY_APPROVAL"] };
  await insertApproval({
    sessionId: null,
    jobId: job.id,
    kind: "RESUME_READY",
    summary: `Resume artifact ${approval.artifactHash} approved.`,
  });
  await audit(job.id, "RESUME_APPROVED", { draftHash: approval.draftHash, artifactHash: approval.artifactHash, ready: true });
  return { ready: true, reasons: [] };
}

export async function reviewExistingResumeForJob(jobId: string, rawText: string): Promise<ResumeRunRecord> {
  if (!resumeStudioEnabled()) throw new ResumeAccessError("RESUME_STUDIO_DISABLED");
  const { job } = await requireJob(jobId);
  const redacted = redactExistingResume(rawText);
  const { context, roleFamilyId } = buildResumeContext({ job });
  const { policy } = loadResumePolicy(roleFamilyId);
  const hosted = createResumeJevRunner();
  const existing = hosted
    ? await reviewExistingText(
        hosted.runner,
        hosted.model,
        { jobText: context.job.advertisement, resumeText: redacted.text },
        policy,
        new AbortController().signal,
      )
    : {
        review: {
          mode: "live" as const,
          status: "unavailable" as const,
          requestedModel: "not-configured",
          resolvedModel: null,
          readinessScore: null,
          assessment: "REVIEW_UNAVAILABLE" as const,
          dimensions: [],
          fixOrder: [],
          errorCode: "REVIEWER_NOT_CONFIGURED",
          draftHash: hash(redacted.text),
          rubricHash: "unavailable",
          policyHash: resumePolicyHash(policy),
        },
        claimVerification: "NOT_RUN" as const,
        canMarkReady: false as const,
      };

  const run = await insertResumeRun({
    jobId: job.id,
    tenantId: DEFAULT_TENANT_ID,
    candidateId: DEFAULT_CANDIDATE_ID,
    idempotencyKey: buildKey({
      tenantId: DEFAULT_TENANT_ID,
      candidateId: DEFAULT_CANDIDATE_ID,
      jobId: job.id,
      profileHash: context.scope.profileHash,
      decisionPolicyHash: context.scope.decisionPolicyHash,
      resumePolicyHash: resumePolicyHash(policy),
      writerRevision: `existing:${hash(redacted.text).slice(0, 16)}`,
      intent: "existing",
    }),
    status: "EXISTING_REVIEWED",
    intent: "existing",
    snapshot: {
      plan: null,
      draft: null,
      guard: null,
      review: existing.review,
      layout: null,
      renderedText: redacted.text,
      renderedHtml: null,
      warnings: [
        "Existing-CV review is presentation QA only. Facts were not claim-mapped.",
        redacted.redacted ? `${redacted.redacted} contact/secret token(s) redacted before the model.` : "",
      ].filter(Boolean),
      pendingReview: [],
      generation: { mode: "not_run", writerRevision: null, writerCallAttempts: 0 },
      roleFit: null,
      resumeReadiness: existing.review.readinessScore,
      reviewLabel: hosted ? "LIVE" : "REVIEW_UNAVAILABLE",
      approval: null,
      existingReview: { claimVerification: "NOT_RUN", canMarkReady: false },
    },
    draftHash: existing.review.draftHash,
    artifactHash: null,
    profileHash: context.scope.profileHash,
    decisionPolicyHash: context.scope.decisionPolicyHash,
    resumePolicyHash: resumePolicyHash(policy),
    writerMode: "not_run",
    writerRevision: null,
    reviewerMode: existing.review.mode,
    reviewerRevision: existing.review.resolvedModel,
    usage: "unknown",
  });
  await audit(job.id, "RESUME_EXISTING_REVIEWED", {
    claimVerification: "NOT_RUN",
    canMarkReady: false,
    reviewLabel: run.snapshot.reviewLabel,
  });
  return run;
}

export async function proposeResumeRewrite(jobId: string, proposal: RewriteProposal) {
  const { job } = await requireJob(jobId);
  const { context } = buildResumeContext({ job });
  return proposeRewrite(context, proposal);
}

export function selectedDraftClaimIds(draft: ResumeDraft | null): string[] {
  return draft ? selectedClaimIds(draft) : [];
}

export function currentResumeContext(job: JobPosting): ResumeContext {
  return buildResumeContext({ job }).context;
}

export { loadResumeArtifact, latestResumeRun, templateDraft };
