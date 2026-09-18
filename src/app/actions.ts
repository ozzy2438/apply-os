"use server";

import { revalidatePath } from "next/cache";
import { bootApp } from "@/lib/boot";
import { parsePosting, stripHtml } from "@/lib/parse";
import { evaluateOpportunity } from "@/lib/jev/evaluate";
import { suggestedStatus } from "@/lib/jev/compose";
import { draftCoverLetter } from "@/lib/cover-letter";
import { checkCoverLetter } from "@/lib/jev/check-letter";
import { ensureTodayBriefing } from "@/lib/briefing-service";
import { DEFAULT_WEIGHTS } from "@/lib/jev/questions";
import { DIMENSION_IDS, STATUSES, type BulletKind, type SourceType, type Status, type Weights } from "@/lib/jev/types";
import {
  getOpportunity,
  getProfile,
  insertCoverLetter,
  insertEvaluation,
  insertOpportunity,
  latestCoverLetter,
  recomposeAll,
  saveProfile,
  updateOpportunityStatus,
} from "@/lib/db/store";

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
    try {
      const response = await fetch(url, { headers: { "User-Agent": "ApplyOS/1.0" }, signal: AbortSignal.timeout(8000) });
      const html = await response.text();
      raw = stripHtml(html).slice(0, 20000);
    } catch {
      return { error: "Could not fetch that URL." };
    }
  }
  if (!raw) return { error: "Paste a posting or recruiter note." };

  const parsed = parsePosting(raw, sourceType === "recruiter_inbound" ? "recruiter_inbound" : "job_posting", url);
  const opportunity = await insertOpportunity({ ...parsed, status: "inbox" });
  const evaluation = await evaluateOpportunity(
    {
      posting: parsed,
      profile: {
        goals: profile.goals,
        constraints: profile.constraints,
        cv: profile.bullets,
      },
    },
    profile.weights,
  );
  await insertEvaluation({
    opportunityId: opportunity.id,
    model: evaluation.model,
    demo: evaluation.demo,
    answers: evaluation.answers,
    composed: evaluation.composed,
  });
  const status = suggestedStatus(evaluation.composed);
  if (status !== "inbox") {
    await updateOpportunityStatus(opportunity.id, status, "auto-status from Jev compose");
  }
  await ensureTodayBriefing(true);
  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  return { id: opportunity.id };
}

export async function changeStatus(opportunityId: string, formData: FormData): Promise<void> {
  await bootApp();
  const status = String(formData.get("status") || "") as Status;
  if (!STATUSES.includes(status)) return;
  if (status === "ready") {
    const letter = await latestCoverLetter(opportunityId);
    if (!letter?.check.ready) return;
  }
  await updateOpportunityStatus(opportunityId, status, "manual");
  await ensureTodayBriefing(true);
  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  revalidatePath(`/opportunities/${opportunityId}`);
}

export async function generateLetter(opportunityId: string, formData?: FormData): Promise<void> {
  void formData;
  const profile = await requireProfile();
  const opportunity = await getOpportunity(opportunityId);
  if (!opportunity) return;
  const draft = await draftCoverLetter(profile, opportunity);
  const check = await checkCoverLetter({ body: draft.body, claims: draft.claims, profile });
  await insertCoverLetter({
    opportunityId,
    body: draft.body,
    claims: draft.claims,
    check,
  });
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
  await recomposeAll();
  await ensureTodayBriefing(true);
  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/inbox");
}

export async function refreshBriefingAction(): Promise<void> {
  await bootApp();
  await ensureTodayBriefing(true);
  revalidatePath("/");
}
