import { bootApp } from "@/lib/boot";
import { ensureTodayBriefing } from "@/lib/briefing-service";
import { formatMelbourne } from "@/lib/time";
import { getBriefing, getOpportunity, latestEvaluation, listOpportunities, listLatestEvaluations } from "@/lib/db/store";
import { OpportunityCard } from "@/components/Decision";
import { refreshBriefingAction } from "@/app/actions";
import { briefingDate, selectMorningDesk } from "@/lib/jev/briefing";

export const dynamic = "force-dynamic";

export default async function MorningDeskPage() {
  await bootApp();
  await ensureTodayBriefing();
  const date = briefingDate();
  const briefing = await getBriefing(date);
  const ids = briefing?.opportunityIds ?? [];
  const cards = [];
  for (const id of ids) {
    const opportunity = await getOpportunity(id);
    const evaluation = await latestEvaluation(id);
    if (opportunity && evaluation) {
      cards.push({ opportunity, composed: evaluation.composed });
    }
  }

  const opps = await listOpportunities();
  const evals = await listLatestEvaluations();
  const byOpp = new Map(evals.map((e) => [e.opportunityId, e]));
  const eligibleCount = selectMorningDesk(
    opps
      .map((opportunity) => {
        const evaluation = byOpp.get(opportunity.id);
        return evaluation ? { opportunity, composed: evaluation.composed } : null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
  ).length;

  return (
    <main>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-brass">{formatMelbourne()} · Australia/Melbourne</p>
          <h2 className="text-xl text-paper">Today&apos;s 3–5</h2>
          <p className="max-w-2xl text-sm text-mute">
            Eligible means high-confidence apply/tailor, no hard-gate fail, not already closed. Ranked by
            fit × action confidence. Weights can change without re-calling Jev.
          </p>
        </div>
        <form action={refreshBriefingAction}>
          <button
            type="submit"
            className="border border-line bg-panel-2 px-3 py-1.5 font-mono text-xs text-paper hover:border-brass"
          >
            Rebuild desk
          </button>
        </form>
      </div>

      {cards.length === 0 ? (
        <div className="border border-line bg-panel p-8 text-sm text-mute">
          No desk-eligible roles today ({eligibleCount} currently eligible after filters). Ingest a posting or
          wait in the review queue.
        </div>
      ) : (
        <div className="grid gap-3">
          {cards.map((card) => (
            <OpportunityCard
              key={card.opportunity.id}
              opportunity={card.opportunity}
              composed={card.composed}
              href={`/opportunities/${card.opportunity.id}`}
            />
          ))}
        </div>
      )}
    </main>
  );
}
