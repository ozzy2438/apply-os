import { SAMPLE_BULLETS, SAMPLE_CONSTRAINTS, SAMPLE_GOALS, SAMPLE_POSTINGS, SAMPLE_WEIGHTS } from "./fixtures";
import {
  countOpportunities,
  getProfile,
  insertEvaluation,
  insertOpportunity,
  saveProfile,
  updateOpportunityStatus,
} from "@/lib/db/store";
import { evaluateOpportunity } from "@/lib/jev/evaluate";
import { suggestedStatus } from "@/lib/jev/compose";
import { ensureTodayBriefing } from "@/lib/briefing-service";

export async function ensureSeeded(): Promise<void> {
  const existing = await getProfile();
  if (!existing) {
    await saveProfile({
      goals: SAMPLE_GOALS,
      constraints: SAMPLE_CONSTRAINTS,
      weights: SAMPLE_WEIGHTS,
      bullets: SAMPLE_BULLETS,
    });
  }
  if ((await countOpportunities()) > 0) return;

  const profile = await getProfile();
  if (!profile) return;

  for (const posting of SAMPLE_POSTINGS) {
    const opportunity = await insertOpportunity({
      id: posting.id,
      sourceType: posting.sourceType,
      title: posting.title,
      company: posting.company,
      location: posting.location,
      compensation: posting.compensation,
      url: posting.url,
      rawText: posting.rawText,
      status: "inbox",
    });
    const evaluation = await evaluateOpportunity(
      {
        posting,
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
      await updateOpportunityStatus(opportunity.id, status, "seed auto-status");
    }
  }

  await ensureTodayBriefing(true);
}
