import { bootApp } from "@/lib/boot";
import { listLatestEvaluations, listOpportunities } from "@/lib/db/store";
import { OpportunityCard } from "@/components/Decision";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  await bootApp();
  const opps = await listOpportunities();
  const evals = await listLatestEvaluations();
  const byOpp = new Map(evals.map((e) => [e.opportunityId, e]));

  return (
    <main>
      <h2 className="mb-1 text-xl text-paper">Inbox</h2>
      <p className="mb-6 text-sm text-mute">Every ingested posting and recruiter note, scored once, ranked in code.</p>
      <div className="grid gap-3">
        {opps.map((opportunity) => {
          const evaluation = byOpp.get(opportunity.id);
          if (!evaluation) return null;
          return (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              composed={evaluation.composed}
              href={`/opportunities/${opportunity.id}`}
            />
          );
        })}
      </div>
    </main>
  );
}
