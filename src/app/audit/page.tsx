import { bootApp } from "@/lib/boot";
import { listAudits } from "@/lib/db/store-extended";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await bootApp();
  const audits = await listAudits(120);

  return (
    <main>
      <h2 className="mb-1 text-xl text-paper">Decision timeline</h2>
      <p className="mb-6 text-sm text-mute">
        Structured audit records — not a generated story. Approvals, blocks, evaluations, and browser steps.
      </p>
      <div className="space-y-2">
        {audits.map((a) => (
          <article key={a.id} className="border border-line bg-panel p-3">
            <p className="font-mono text-[10px] uppercase text-brass">
              {a.eventType} · {a.modelProvider ?? "code"} · {a.policyVersion}
            </p>
            <p className="text-xs text-mute">{a.createdAt}</p>
            {a.jobId ? (
              <Link href={`/opportunities/${a.jobId}`} className="text-xs text-brass">
                Job {a.jobId}
              </Link>
            ) : null}
            <pre className="mt-2 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-mute">
              {JSON.stringify(
                { decision: a.decisionSummary, policy: a.policyResult, execution: a.executionResult },
                null,
                2,
              )}
            </pre>
          </article>
        ))}
        {audits.length === 0 ? <p className="text-sm text-mute">No audit events yet.</p> : null}
      </div>
    </main>
  );
}
