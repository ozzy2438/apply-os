"use server";

import { revalidatePath } from "next/cache";
import { bootApp } from "@/lib/boot";
import { stripHtml } from "@/lib/parse";
import { draftCoverLetter } from "@/lib/cover-letter";
import { checkCoverLetter } from "@/lib/jev/check-letter";
import { ensureTodayBriefing } from "@/lib/briefing-service";
import { DEFAULT_WEIGHTS } from "@/lib/jev/questions";
import { DIMENSION_IDS, STATUSES, type BulletKind, type SourceType, type Status, type Weights } from "@/lib/jev/types";
import {
  getOpportunity,
  getProfile,
  insertCoverLetter,
  latestCoverLetter,
  recomposeAll,
  saveProfile,
  updateOpportunityStatus,
} from "@/lib/db/store";
import { ingestCanonical } from "@/lib/ingest/pipeline";
import {
  getCandidateRules,
  getCanonicalJob,
  hasApproval,
  insertApproval,
  insertAudit,
  insertNote,
  listEvidence,
  replaceEvidence,
  saveCandidateRules,
  upsertEvidence,
} from "@/lib/db/store-extended";
import { evidenceFromBullets } from "@/lib/policy/evidence";
import { playwrightExtractUrl } from "@/lib/browser/playwright";
import { liveBrowserAllowed } from "@/lib/browser/flags";
import { DEFAULT_CANDIDATE_PROFILE } from "@/lib/domain/defaults";
import { candidateEvidenceSchema } from "@/lib/domain/schemas";
import { getGenerationProvider } from "@/lib/providers/factory";
import { POLICY_VERSION } from "@/lib/policy/version";

async function requireProfile() {
  await bootApp();
  const profile = await getProfile();
  if (!profile) throw new Error("Profile missing");
  return profile;
}

export async function ingestOpportunity(formData: FormData): Promise<{ id: string } | { error: string }> {
  const profile = await requireProfile();
  const sourceType = String(formData.get("sourceType") || "job_posting") as SourceType;
  const url = String(formData.get("url") || "").trim() || null;
  let raw = String(formData.get("rawText") || "").trim();
  if (!raw && url) {
    if (liveBrowserAllowed()) {
      const extracted = await playwrightExtractUrl(url);
      if (extracted.ok) raw = extracted.text;
    }
    if (!raw) {
      try {
        const response = await fetch(url, { headers: { "User-Agent": "ApplyOS/1.0" }, signal: AbortSignal.timeout(8000) });
        const html = await response.text();
        raw = stripHtml(html).slice(0, 20000);
      } catch {
        return { error: "Could not fetch that URL." };
      }
    }
  }
  if (!raw) return { error: "Paste a posting, use the form, or supply a URL." };

  const result = await ingestCanonical({ rawText: raw, url, sourceType, profile });
  await ensureTodayBriefing(true);
  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/audit");
  return { id: result.opportunityId };
}

export async function changeStatus(opportunityId: string, formData: FormData): Promise<void> {
  await bootApp();
  const status = String(formData.get("status") || "") as Status;
  if (!STATUSES.includes(status)) return;
  const current = await getOpportunity(opportunityId);
  if (!current) return;
  if (status === "ready") {
    const letter = await latestCoverLetter(opportunityId);
    if (!letter?.check.ready) return;
  }
  if (status === "applied") {
    const approved = await hasApproval(opportunityId, "SUBMIT");
    if (!approved) return;
  }
  await updateOpportunityStatus(opportunityId, status, "manual");
  await insertAudit({
    userId: "default",
    jobId: opportunityId,
    eventType: "APPLICATION_STATUS_CHANGED",
    profileVersion: (await getCandidateRules()).version,
    policyVersion: POLICY_VERSION,
    modelProvider: null,
    modelVersion: null,
    inputHash: null,
    observationVersion: null,
    decisionSummary: { from: current.status, to: status },
    policyResult: {},
    executionResult: {},
  });
  await ensureTodayBriefing(true);
  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/audit");
  revalidatePath(`/opportunities/${opportunityId}`);
}

export async function approveSubmit(opportunityId: string): Promise<void> {
  await bootApp();
  await insertApproval({
    sessionId: null,
    jobId: opportunityId,
    kind: "SUBMIT",
    summary: "User confirmed application submission / Applied status.",
  });
  revalidatePath(`/opportunities/${opportunityId}`);
}

export async function generateLetter(opportunityId: string, formData?: FormData): Promise<void> {
  void formData;
  const profile = await requireProfile();
  const opportunity = await getOpportunity(opportunityId);
  if (!opportunity) return;
  const evidence = await listEvidence();
  const job = await getCanonicalJob(opportunityId);
  const draft = await draftCoverLetter(profile, opportunity);
  const check = await checkCoverLetter({
    body: draft.body,
    claims: draft.claims,
    profile,
    evidence: evidence.length ? evidence : evidenceFromBullets(profile.bullets),
    job: job ?? undefined,
  });
  await insertCoverLetter({
    opportunityId,
    body: draft.body,
    claims: draft.claims,
    check,
  });
  await insertAudit({
    userId: "default",
    jobId: opportunityId,
    eventType: "COVER_LETTER_GENERATED",
    profileVersion: (await getCandidateRules()).version,
    policyVersion: POLICY_VERSION,
    modelProvider: "DEMO",
    modelVersion: draft.source,
    inputHash: null,
    observationVersion: null,
    decisionSummary: { ready: check.ready, blockers: check.blockers },
    policyResult: { atomic: check.atomic ?? [] },
    executionResult: {},
  });
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/audit");
}

export async function draftRecruiterReply(opportunityId: string): Promise<{ body: string }> {
  const profile = await requireProfile();
  const job = await getCanonicalJob(opportunityId);
  const rules = await getCandidateRules();
  const evidence = await listEvidence();
  if (!job) return { body: "Import/normalize the job before drafting a recruiter reply." };
  const gen = getGenerationProvider();
  const message = await gen.draftRecruiterMessage({
    job,
    candidate: rules,
    evidence: evidence.length ? evidence : evidenceFromBullets(profile.bullets),
  });
  return { body: message.body };
}

export async function addJobNote(opportunityId: string, formData: FormData): Promise<void> {
  await bootApp();
  const body = String(formData.get("note") || "").trim();
  if (!body) return;
  await insertNote(opportunityId, body);
  revalidatePath(`/opportunities/${opportunityId}`);
}

export async function saveProfileAction(formData: FormData): Promise<void> {
  await bootApp();
  const goals = String(formData.get("goals") || "");
  const weights = { ...DEFAULT_WEIGHTS } as Weights;
  for (const id of DIMENSION_IDS) {
    const raw = Number(formData.get(`weight_${id}`));
    if (Number.isFinite(raw) && raw >= 0) weights[id] = raw;
  }
  const constraints = {
    workRights: String(formData.get("workRights") || ""),
    locations: String(formData.get("locations") || "")
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean),
    workMode: String(formData.get("workMode") || ""),
    compensationFloorAud: Number(formData.get("compensationFloorAud") || 0),
    seniorityBand: String(formData.get("seniorityBand") || ""),
  };
  const bulletTexts = formData.getAll("bulletText").map(String);
  const bulletKinds = formData.getAll("bulletKind").map(String);
  const bulletIds = formData.getAll("bulletId").map(String);
  const bullets = bulletTexts
    .map((text, i) => ({
      id: bulletIds[i] || undefined,
      text: text.trim(),
      kind: (bulletKinds[i] || "independent") as BulletKind,
      sortOrder: i + 1,
    }))
    .filter((b) => b.text.length > 0);

  await saveProfile({ goals, constraints, weights, bullets });

  const existingRules = await getCandidateRules();
  const list = (name: string) =>
    String(formData.get(name) || "")
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
  await saveCandidateRules({
    ...existingRules,
    ...DEFAULT_CANDIDATE_PROFILE,
    ...existingRules,
    version: existingRules.version + 1,
    targetRoles: list("targetRoles").length ? list("targetRoles") : existingRules.targetRoles,
    excludedRoles: list("excludedRoles"),
    explicitRedFlags: list("explicitRedFlags"),
    preferredLocations: constraints.locations.length ? constraints.locations : existingRules.preferredLocations,
    minimumSalary: {
      ...existingRules.minimumSalary,
      amount: constraints.compensationFloorAud || existingRules.minimumSalary.amount,
    },
    maxJobAgeDays: Number(formData.get("maxJobAgeDays") || existingRules.maxJobAgeDays),
    applicationRules: {
      ...existingRules.applicationRules,
      applyRecommendationMinimumScore: Number(formData.get("applyMin") || existingRules.applicationRules.applyRecommendationMinimumScore),
      minimumDecisionConfidence: Number(formData.get("minConfidence") || existingRules.applicationRules.minimumDecisionConfidence),
    },
  });
  const existingEvidence = await listEvidence();
  const kept = existingEvidence.filter((e) => e.verificationMethod !== "CV_EXTRACTED");
  await replaceEvidence([
    ...evidenceFromBullets(bullets.map((b, i) => ({ id: b.id || `b-${i}`, text: b.text, kind: b.kind }))),
    ...kept,
  ]);
  await recomposeAll();
  await ensureTodayBriefing(true);
  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/evidence");
  revalidatePath("/inbox");
}

export async function saveEvidenceAction(formData: FormData): Promise<void> {
  await bootApp();
  const parsed = candidateEvidenceSchema.parse({
    id: String(formData.get("id") || `ev-${Date.now()}`),
    candidateProfileId: "default",
    type: String(formData.get("type") || "PROJECT"),
    claim: String(formData.get("claim") || ""),
    sourceReference: String(formData.get("sourceReference") || "manual"),
    sourceText: String(formData.get("sourceText") || formData.get("claim") || ""),
    skills: String(formData.get("skills") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    domains: String(formData.get("domains") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    yearsOfExperience: null,
    verified: String(formData.get("verified") || "true") === "true",
    verificationMethod: String(formData.get("verificationMethod") || "USER_CONFIRMED"),
  });
  if (!parsed.claim.trim()) return;
  await upsertEvidence(parsed);
  revalidatePath("/evidence");
}

export async function refreshBriefingAction(): Promise<void> {
  await bootApp();
  await ensureTodayBriefing(true);
  revalidatePath("/");
}
