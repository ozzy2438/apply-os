import { briefingDate, selectMorningDesk } from "@/lib/jev/briefing";
import { getBriefing, listLatestEvaluations, listOpportunities, saveBriefing } from "@/lib/db/store";

export async function ensureTodayBriefing(force = false) {
  const date = briefingDate();
  const existing = force ? null : await getBriefing(date);
  if (existing) return existing;

  const opps = await listOpportunities();
  const evals = await listLatestEvaluations();
  const byOpp = new Map(evals.map((e) => [e.opportunityId, e]));
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
