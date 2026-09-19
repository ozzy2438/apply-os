import { SAMPLE_BULLETS, SAMPLE_GOALS, SAMPLE_POSTINGS, SAMPLE_WEIGHTS } from "./fixtures";
import {
  countOpportunities,
  getProfile,
  insertEvaluation,
  insertOpportunity,
  listOpportunities,
  saveProfile,
  updateOpportunityStatus,
} from "@/lib/db/store";
import { evaluateOpportunity } from "@/lib/jev/evaluate";
import { suggestedStatus } from "@/lib/jev/compose";
import { ensureTodayBriefing } from "@/lib/briefing-service";
import { evidenceFromBullets } from "@/lib/policy/evidence";
import { getCandidateRules, listEvidence, replaceEvidence, saveCandidateRules } from "@/lib/db/store-extended";
import { backfillCanonicalForOpportunity } from "@/lib/ingest/pipeline";
import { loadCanonicalProfile } from "@/lib/canonical/load";
import { canonicalConstraints, canonicalGoals, mapCanonicalToRules } from "@/lib/canonical/map";
import { PROFILE_VERSION_NUMBER } from "@/lib/canonical/types";

export async function ensureSeeded(): Promise<void> {
  const existing = await getProfile();
  if (!existing) {
    const canonical = loadCanonicalProfile();
    await saveProfile({
      goals: canonicalGoals(canonical),
      constraints: canonicalConstraints(canonical),
      weights: SAMPLE_WEIGHTS,
      bullets: SAMPLE_BULLETS,
    });
  } else if (existing.goals === SAMPLE_GOALS) {
    const canonical = loadCanonicalProfile();
    await saveProfile({
      goals: canonicalGoals(canonical),
      constraints: canonicalConstraints(canonical),
      weights: existing.weights,
      bullets: existing.bullets,
    });
  }

  if ((await countOpportunities()) === 0) {
    const profile = await getProfile();
    if (profile) {
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
  }

  await ensureLayerTwo();
}

export async function ensureLayerTwo(): Promise<void> {
  const profile = await getProfile();
  if (!profile) return;

  const rules = await getCandidateRules();
  if (!rules || rules.targetRoles.length === 0 || rules.version < PROFILE_VERSION_NUMBER) {
    await saveCandidateRules(mapCanonicalToRules(loadCanonicalProfile()));
  } else {
    await saveCandidateRules(rules);
  }

  const evidence = await listEvidence();
  if (evidence.length === 0) {
    await replaceEvidence(evidenceFromBullets(profile.bullets));
  }

  const opps = await listOpportunities();
  for (const opp of opps) {
    await backfillCanonicalForOpportunity({
      id: opp.id,
      rawText: opp.rawText,
      url: opp.url,
      sourceType: opp.sourceType,
      title: opp.title,
      company: opp.company,
    });
  }
}
