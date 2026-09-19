import { bootApp } from "@/lib/boot";
import { ensureTodayBriefing } from "@/lib/briefing-service";
import { formatMelbourne } from "@/lib/time";
import { getBriefing, getOpportunity, latestEvaluation, listOpportunities, listLatestEvaluations } from "@/lib/db/store";
import { latestJobEvaluationV2 } from "@/lib/db/store-extended";
import { DiscoveryFactsStrip, OpportunityCard } from "@/components/Decision";
import { refreshBriefingAction } from "@/app/actions";
import { briefingDate, selectMorningDesk } from "@/lib/jev/briefing";
import Link from "next/link";
import { explanationFromEvaluation } from "@/lib/policy/compose";
import { deskDiscoveryFacts, discoveryFactsForJob } from "@/lib/discovery";

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
    const v2 = await latestJobEvaluationV2(id);
    const discovery = await discoveryFactsForJob(id);
    const facts = deskDiscoveryFacts(discovery, v2 ?? null);
    if (opportunity && evaluation) {
      cards.push({ opportunity, composed: evaluation.composed, v2, facts });
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
            Ranked by fit, recency, evidence readiness, strategic value, preference, and company diversity —
            not keyword search. Code owns the weights.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/ingest" className="border border-line px-3 py-1.5 font-mono text-xs hover:border-brass">
            Paste a job
          </Link>
          <Link href="/discover" className="border border-line px-3 py-1.5 font-mono text-xs hover:border-brass">
            Discovery assistant
          </Link>
          <form action={refreshBriefingAction}>
            <button
              type="submit"
              className="border border-line bg-panel-2 px-3 py-1.5 font-mono text-xs text-paper hover:border-brass"
            >
              Rebuild desk
            </button>
          </form>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="border border-line bg-panel p-8 text-sm text-mute">
          No desk-eligible roles today ({eligibleCount} currently eligible after filters). Ingest a posting or
          start a read-only discovery session. Provider discovery feeds only triaged shortlist roles here —
          not raw search hits.
        </div>
      ) : (
        <div className="grid gap-3">
          {cards.map((card) => (
            <div key={card.opportunity.id} className="space-y-2">
              <OpportunityCard
                opportunity={card.opportunity}
                composed={card.composed}
                href={`/opportunities/${card.opportunity.id}`}
              />
              {card.facts ? <DiscoveryFactsStrip {...card.facts} /> : null}
              {card.v2 ? (
                <pre className="whitespace-pre-wrap border border-line bg-panel-2 p-3 font-mono text-[11px] text-mute">
                  {explanationFromEvaluation(card.v2)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
