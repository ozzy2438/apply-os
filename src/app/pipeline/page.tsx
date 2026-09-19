import { bootApp } from "@/lib/boot";
import { listLatestEvaluations, listOpportunities } from "@/lib/db/store";
import { STATUSES } from "@/lib/jev/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  await bootApp();
  const opps = await listOpportunities();
  const evals = await listLatestEvaluations();
  const byOpp = new Map(evals.map((e) => [e.opportunityId, e]));

  return (
    <main>
      <h2 className="mb-1 text-xl text-paper">Pipeline</h2>
      <p className="mb-6 text-sm text-mute">
        Status is a human action. Ready is blocked until claims verify. Applied needs an explicit submit
        approval. The app never sends the application.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((status) => {
          const items = opps.filter((o) => o.status === status);
          return (
            <section key={status} className="border border-line bg-panel p-3">
              <h3 className="mb-3 font-mono text-xs uppercase tracking-wider text-brass">
                {status} · {items.length}
              </h3>
              <div className="space-y-2">
                {items.map((item) => {
                  const evaluation = byOpp.get(item.id);
                  return (
                    <Link
                      key={item.id}
                      href={`/opportunities/${item.id}`}
                      className="block border border-line bg-panel-2 p-2 text-sm hover:border-brass"
                    >
                      <p className="text-paper">{item.title}</p>
                      <p className="font-mono text-[10px] text-mute">
                        {item.company}
                        {evaluation ? ` · fit ${Math.round(evaluation.composed.fit * 100)}` : ""}
                      </p>
                    </Link>
                  );
                })}
                {items.length === 0 ? <p className="text-xs text-mute">Empty</p> : null}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
