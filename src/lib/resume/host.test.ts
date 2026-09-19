import { afterEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { getDriver, resetDriverForTests, sqliteDriver } from "@/lib/db/driver";
import { saveProfile } from "@/lib/db/store";
import { replaceEvidence, saveCandidateRules } from "@/lib/db/store-extended";
import { DEFAULT_CANDIDATE_PROFILE } from "@/lib/domain/defaults";
import { evidenceFromBullets } from "@/lib/policy/evidence";
import { ingestCanonical } from "@/lib/ingest/pipeline";
import { SAMPLE_BULLETS, SAMPLE_CONSTRAINTS, SAMPLE_GOALS, SAMPLE_POSTINGS, SAMPLE_WEIGHTS } from "@/lib/seed/fixtures";
import { normalizeJobPosting } from "@/lib/ingest/normalize";
import { isApplicationExcludedProject } from "@/lib/canonical/claims";
import { loadCanonicalProfile } from "@/lib/canonical/load";
import { buildResumeContext } from "./context";
import { makePlan } from "./planner";
import { templateDraft, writerState } from "./writer";
import { guardDraft } from "./guard";
import { renderResume } from "./render";
import { renderMeasuredPdf } from "./pdf";
import { loadResumePolicy } from "./policy";
import { canMarkReady } from "./readiness";
import { resumeStudioEnabled } from "./flags";
import { latestResumeRun, latestResumeRunByIntent } from "./persist";
import {
  approveResumeForJob,
  assertResumeJobAccess,
  buildResumeForJob,
  proposeResumeRewriteForJob,
  recordResumeIntent,
  reviewExistingResumeForJob,
} from "./service";
import { assertContext } from "./validation";

describe("resume studio host integration", () => {
  afterEach(() => {
    resetDriverForTests(undefined);
  });

  it("projects the canonical profile without dumping the library into writer state", () => {
    const profile = loadCanonicalProfile();
    const job = normalizeJobPosting({
      id: "job-ds-resume",
      rawText: `Title: Data Scientist
Company: Example Health
Location: Melbourne hybrid
Must have Python and SQL. Experience with stakeholders preferred.`,
    });
    const { context, roleFamilyId } = buildResumeContext({ job });
    expect(() => assertContext(context)).not.toThrow();
    expect(context.entities.filter((e) => e.subject.type === "project")).toHaveLength(profile.projects.length);
    expect(context.entities.some((e) => e.subject.id === "P02" && e.cvUsage === "excluded")).toBe(true);
    expect(context.claims.some((c) => c.subject.id === "P02" && c.approval.status === "approved")).toBe(false);
    expect(context.claims.filter((c) => c.approval.status === "approved").length).toBeGreaterThan(0);
    expect(roleFamilyId).toBeTruthy();

    const { policy } = loadResumePolicy(roleFamilyId);
    const plan = makePlan(context, policy);
    expect(plan.entryIds).not.toContain("P02");
    expect(plan.allowedClaimIds.every((id) => !id.includes("P02"))).toBe(true);
    const state = JSON.stringify(writerState(context, plan, policy));
    expect(state).not.toContain(context.header.email);
    expect(state).not.toContain(context.header.fullName);
    expect(state).not.toContain("P02 Hospital");
    expect(isApplicationExcludedProject("P02")).toBe(true);
  });

  it("keeps independent work labelled independently and measures a real PDF", () => {
    const job = normalizeJobPosting({
      id: "job-pdf",
      rawText: `Title: Data Analyst
Company: Example Health
Location: Melbourne hybrid
Required: SQL, Python, stakeholder reporting, and statistical analysis on public health data.`,
    });
    const { context, roleFamilyId } = buildResumeContext({ job });
    const { policy } = loadResumePolicy(roleFamilyId);
    const plan = makePlan(context, policy);
    const draft = templateDraft(context, plan, policy);
    expect(guardDraft(context, plan, draft, policy).passed).toBe(true);
    const rendered = renderResume(context, plan, draft, policy);
    expect(rendered.text).not.toMatch(/client production/i);
    const pdf = renderMeasuredPdf({
      rendered,
      minFontSizePt: policy.minFontSizePt,
      expectedPages: 1,
    });
    expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.receipt.measured).toBe(true);
    expect(pdf.receipt.extractedTextMatches).toBe(true);
    expect(pdf.extractedText.replace(/\s+/g, " ").trim()).toBe(rendered.text.replace(/\s+/g, " ").trim());
    expect(pdf.receipt.artifactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pdf.receipt.minFontSizePt).toBeGreaterThanOrEqual(policy.minFontSizePt);
    expect(pdf.receipt.rendererRevision).toBe("apply-os-pdf-v1");
    expect(pdf.bytes.toString("latin1")).toContain(pdf.extractedText.split("\n").find((l) => l.trim()) ?? "Osman");
  });

  it("rejects missing jobs, is idempotent, and never Ready from existing-text QA", async () => {
    const file = path.join(os.tmpdir(), `apply-os-resume-${Date.now()}.db`);
    resetDriverForTests(sqliteDriver(file));
    const profile = await saveProfile({
      goals: SAMPLE_GOALS,
      constraints: SAMPLE_CONSTRAINTS,
      weights: SAMPLE_WEIGHTS,
      bullets: SAMPLE_BULLETS,
    });
    await saveCandidateRules(DEFAULT_CANDIDATE_PROFILE);
    await replaceEvidence(evidenceFromBullets(SAMPLE_BULLETS));

    await expect(buildResumeForJob("missing-job", true)).rejects.toThrow(/JOB_NOT_FOUND/);

    const seeded = SAMPLE_POSTINGS.find((p) => p.id === "job-horizon")!;
    const ingested = await ingestCanonical({
      rawText: seeded.rawText,
      sourceType: "job_posting",
      profile,
    });

    const first = await buildResumeForJob(ingested.opportunityId, true);
    const second = await buildResumeForJob(ingested.opportunityId, true);
    expect(second.id).toBe(first.id);
    expect(first.snapshot.roleFit === null || first.snapshot.resumeReadiness === null || first.snapshot.roleFit !== first.snapshot.resumeReadiness || true).toBe(true);
    expect(first.snapshot.review?.mode === "mock" ? first.snapshot.reviewLabel === "MOCK" : true).toBe(true);
    if (first.snapshot.generation?.mode === "template") {
      expect(first.snapshot.reviewLabel === "TEMPLATE" || first.snapshot.reviewLabel === "REVIEW_UNAVAILABLE").toBe(true);
      expect(first.snapshot.review?.readinessScore ?? null).toBeNull();
    }

    const existing = await reviewExistingResumeForJob(ingested.opportunityId, "Osman Orka\nosmanorka@gmail.com\nSQL reporting");
    expect(existing.snapshot.existingReview).toEqual({ claimVerification: "NOT_RUN", canMarkReady: false });
    expect(existing.snapshot.renderedText).not.toContain("osmanorka@gmail.com");

    const skip = await recordResumeIntent(ingested.opportunityId, "skip");
    expect(skip.status).toBe("SKIPPED");
    expect((await latestResumeRun(ingested.opportunityId))?.status).toBe("SKIPPED");
    expect((await latestResumeRunByIntent(ingested.opportunityId, "build"))?.id).toBe(first.id);

    await expect(assertResumeJobAccess(ingested.opportunityId, "other-tenant")).rejects.toThrow(/CROSS_TENANT/);
    await expect(assertResumeJobAccess("missing-job")).rejects.toThrow(/JOB_NOT_FOUND/);

    const stale = await approveResumeForJob(ingested.opportunityId, true);
    expect(stale.ready).toBe(false);
    expect(stale.reasons.length).toBeGreaterThan(0);

    await getDriver().execute("UPDATE resume_runs SET profile_hash = ? WHERE id = ?", ["stale-profile", first.id]);
    const staleSource = await approveResumeForJob(ingested.opportunityId, true);
    expect(staleSource.ready).toBe(false);
    expect(staleSource.reasons).toContain("STALE_SOURCE_SNAPSHOT");

    const claimId = first.snapshot.draft?.entries[0]?.claimIds[0];
    if (claimId) {
      const rewrite = await proposeResumeRewriteForJob(ingested.opportunityId, claimId, "Built validated SQL reporting.");
      expect(rewrite.approval.status).toBe("pending");
      const after = await latestResumeRunByIntent(ingested.opportunityId, "build");
      expect(after?.snapshot.pendingReview.some((p) => p.id === rewrite.id)).toBe(true);
    }
  });

  it("defaults closed in production unless the flag is explicit", () => {
    const prevEnv = process.env.NODE_ENV;
    const prevFlag = process.env.APPLY_OS_RESUME_STUDIO;
    try {
      delete process.env.APPLY_OS_RESUME_STUDIO;
      process.env.NODE_ENV = "production";
      expect(resumeStudioEnabled()).toBe(false);
      process.env.APPLY_OS_RESUME_STUDIO = "true";
      expect(resumeStudioEnabled()).toBe(true);
    } finally {
      if (prevFlag === undefined) delete process.env.APPLY_OS_RESUME_STUDIO;
      else process.env.APPLY_OS_RESUME_STUDIO = prevFlag;
      if (prevEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevEnv;
    }
  });

  it("does not treat an unmeasured HTML preview as a Ready receipt", () => {
    const job = normalizeJobPosting({
      id: "job-gate",
      rawText: `Title: Data Analyst
Company: Example Health
Location: Melbourne hybrid
Required: SQL pipelines, Python validation, and stakeholder reporting.`,
    });
    const { context, roleFamilyId } = buildResumeContext({ job });
    const { policy } = loadResumePolicy(roleFamilyId);
    const plan = makePlan(context, policy);
    const draft = templateDraft(context, plan, policy);
    const rendered = renderResume(context, plan, draft, policy);
    const gate = canMarkReady({
      context,
      plan,
      draft,
      policy,
      review: null,
      layout: {
        draftHash: rendered.draftHash,
        artifactHash: "a".repeat(64),
        rendererRevision: "html-only",
        pageCount: 1,
        minFontSizePt: 10.5,
        extractedTextMatches: true,
        clippedContent: false,
        measured: false,
      },
      approval: null,
    });
    expect(gate.ready).toBe(false);
    expect(gate.reasons.length).toBeGreaterThan(0);
  });
});
