import { briefingDate, selectMorningDesk } from "@/lib/jev/briefing";
import { getBriefing, listLatestEvaluations, listOpportunities, saveBriefing } from "@/lib/db/store";
import { getCandidateRules, listCanonicalJobs, listEvidence, listLatestJobEvaluationsV2 } from "@/lib/db/store-extended";
import { evidenceReadiness } from "@/lib/policy/evidence";
import { preferenceScore, rankMorningDesk } from "@/lib/policy/desk-ranking";

export async function ensureTodayBriefing(force = false) {
  const date = briefingDate();
  const existing = force ? null : await getBriefing(date);
  if (existing) return existing;

  const jobs = await listCanonicalJobs();
  const evals = await listLatestJobEvaluationsV2();
  if (jobs.length && evals.length) {
    const byId = new Map(evals.map((e) => [e.jobId, e]));
    const rules = await getCandidateRules();
    const evidence = await listEvidence();
    const rows = jobs
      .map((job) => {
        const evaluation = byId.get(job.id);
        if (!evaluation) return null;
        return {
          job,
          evaluation,
          evidenceReadiness: evidenceReadiness(job, evidence, rules),
          preferenceScore: preferenceScore(job, rules.preferredLocations),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
    const selected = rankMorningDesk(rows, 5);
    if (selected.length >= 3) {
      return saveBriefing(
        date,
        selected.map((row) => row.job.id),
      );
    }
  }

  const opps = await listOpportunities();
  const v1 = await listLatestEvaluations();
  const byOpp = new Map(v1.map((e) => [e.opportunityId, e]));
  const ranked = opps
    .map((opportunity) => {
      const evaluation = byOpp.get(opportunity.id);
      if (!evaluation) return null;
      return { opportunity, composed: evaluation.composed };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const selected = selectMorningDesk(ranked, 5);
  return saveBriefing(
    date,
    selected.map((row) => row.opportunity.id),
  );
}
