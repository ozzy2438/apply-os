import { bootApp } from "@/lib/boot";
import { listLatestEvaluations, listOpportunities } from "@/lib/db/store";
import { latestJobEvaluationV2 } from "@/lib/db/store-extended";
import { OpportunityCard } from "@/components/Decision";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ decision?: string }>;
}) {
  await bootApp();
  const { decision } = await searchParams;
  const opps = await listOpportunities();
  const evals = await listLatestEvaluations();
  const byOpp = new Map(evals.map((e) => [e.opportunityId, e]));

  const rows = [];
  for (const opportunity of opps) {
    const evaluation = byOpp.get(opportunity.id);
    if (!evaluation) continue;
    const v2 = await latestJobEvaluationV2(opportunity.id);
    if (decision && v2 && v2.finalDecision !== decision) continue;
    rows.push({ opportunity, evaluation, v2 });
  }

  return (
    <main>
      <h2 className="mb-1 text-xl text-paper">Inbox</h2>
      <p className="mb-4 text-sm text-mute">
        Every imported posting, scored once. Filters use the policy decision, not keywords.
      </p>
      <div className="mb-6 flex flex-wrap gap-2 font-mono text-xs">
        {[
          ["", "All"],
          ["APPLY_CANDIDATE", "Apply candidates"],
          ["REVIEW_REQUIRED", "Review"],
          ["SKIP", "Skip"],
        ].map(([value, label]) => (
          <Link
            key={label}
            href={value ? `/inbox?decision=${value}` : "/inbox"}
            className={`border px-3 py-1.5 ${decision === value || (!decision && !value) ? "border-brass text-brass" : "border-line text-paper"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <div className="grid gap-3">
        {rows.map((row) => (
          <div key={row.opportunity.id}>
            <OpportunityCard
              opportunity={row.opportunity}
              composed={row.evaluation.composed}
              href={`/opportunities/${row.opportunity.id}`}
            />
            {row.v2 ? (
              <p className="mt-1 font-mono text-[10px] text-mute">
                Policy {row.v2.finalDecision} · fit {Math.round(row.v2.finalFitScore * 100)} · extract{" "}
                {Math.round((row.v2.semanticSignals.missingInformationProbability || 0) * 100)}% missing · blockers{" "}
                {row.v2.deterministicResults.hardBlockers.length}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </main>
  );
}
