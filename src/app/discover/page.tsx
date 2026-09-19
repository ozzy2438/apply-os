import { bootApp } from "@/lib/boot";
import { getBrowserSession } from "@/lib/db/store-extended";
import { observeDemoPage } from "@/lib/browser/demo-board";
import { buildActionSpace } from "@/lib/browser/action-space";
import { getDecisionProvider } from "@/lib/providers/factory";
import { browserModeLabel } from "@/lib/browser/flags";
import { startDiscoverySession, stepDiscovery, stopDiscovery } from "./actions";

export const dynamic = "force-dynamic";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  await bootApp();
  const { session: sessionId } = await searchParams;
  const session = sessionId ? await getBrowserSession(sessionId) : null;
  const mode = browserModeLabel();

  let observation = null;
  let space = null;
  let proposal = null;
  if (session) {
    observation = observeDemoPage({
      sessionId: session.id,
      task: session.task,
      step: session.task.importedJobIds.length,
      page: session.page,
      recentActions: [],
    });
    space = buildActionSpace(observation, session.task);
    proposal = await getDecisionProvider().decideBrowserAction({
      browserState: observation,
      actionSpace: space,
      task: session.task,
    });
  }

  return (
    <main className="space-y-6">
      <div>
        <h2 className="text-xl text-paper">Job Discovery Assistant</h2>
        <p className="max-w-2xl text-sm text-mute">
          An assistant, not an autonomous applicant. Read-only discovery first. Apply, message, upload, and
          payments never run without a just-in-time confirmation — and demo mode never opens a real browser.
        </p>
        <p className="mt-2 font-mono text-[10px] uppercase text-brass">Mode · {mode.replaceAll("-", " ")}</p>
      </div>

      <section className="border border-line bg-panel p-4">
        <h3 className="mb-2 font-mono text-xs uppercase text-brass">Start</h3>
        <form action={startDiscoverySession}>
          <button type="submit" className="bg-brass px-4 py-2 font-mono text-xs text-ink">
            Start read-only discovery (simulated SEEK-style board)
          </button>
        </form>
      </section>

      {session && observation && space && proposal ? (
        <section className="space-y-4 border border-line bg-panel p-4">
          <p className="font-mono text-xs text-mute">
            Session {session.id} · {session.status} · imported {session.task.importedJobIds.length}/
            {session.task.maxJobs}
          </p>
          <div>
            <p className="font-mono text-[10px] uppercase text-brass">Observation</p>
            <p className="text-sm text-paper">
              {observation.page.title} · {observation.page.url}
            </p>
            <p className="font-mono text-[10px] text-mute">version {observation.page.observationVersion}</p>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap border border-line bg-ink p-3 text-xs text-mute">
              {observation.visibleTextSummary}
            </pre>
          </div>
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase text-brass">Action space (code-built)</p>
            <ol className="space-y-1 font-mono text-[11px] text-mute">
              {space.indexed.map((row) => (
                <li key={row.index}>
                  [{row.index}] {row.label} · {row.risk}
                </li>
              ))}
            </ol>
          </div>
          <div className="border border-line bg-panel-2 p-3">
            <p className="font-mono text-[10px] uppercase text-brass">Jev proposal</p>
            <p className="text-sm text-paper">
              {proposal.rationaleCode} · {proposal.action.kind} · conf {Math.round(proposal.confidence * 100)}
            </p>
            <p className="text-xs text-mute">{JSON.stringify(proposal.action)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={stepDiscovery.bind(null, session.id)}>
              <button type="submit" className="border border-brass px-3 py-1.5 font-mono text-xs text-brass">
                Execute proposed (policy-gated)
              </button>
            </form>
            <form action={stopDiscovery.bind(null, session.id)}>
              <button type="submit" className="border border-line px-3 py-1.5 font-mono text-xs">
                Stop
              </button>
            </form>
          </div>
        </section>
      ) : (
        <p className="text-sm text-mute">No active session. Start one to see a live action space.</p>
      )}
    </main>
  );
}
