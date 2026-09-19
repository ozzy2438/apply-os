import { bootApp } from "@/lib/boot";
import { getBrowserSession } from "@/lib/db/store-extended";
import { observeDemoPage } from "@/lib/browser/demo-board";
import { buildActionSpace } from "@/lib/browser/action-space";
import { getDecisionProvider } from "@/lib/providers/factory";
import { browserModeLabel } from "@/lib/browser/flags";
import { runProviderDiscoveryAction, startDiscoverySession, stepDiscovery, stopDiscovery } from "./actions";
import { profileSummary } from "@/lib/canonical/summary";
import { discoveryEnabled, discoveryModeLabel, exaEnabled, latestDiscoveryRun, listDiscoveryItems } from "@/lib/discovery";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  await bootApp();
  const summary = profileSummary();
  const { session: sessionId } = await searchParams;
  const session = sessionId ? await getBrowserSession(sessionId) : null;
  const mode = browserModeLabel();
  const discoveryOn = discoveryEnabled();
  const lastRun = discoveryOn ? await latestDiscoveryRun() : null;
  const lastItems = lastRun ? await listDiscoveryItems(lastRun.id) : [];
  const liveExa = exaEnabled();

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
          An assistant, not an autonomous applicant. Provider search (Exa first) returns lightweight
          metadata, then Apply OS triage decides what is worth hydrating. Apply, message, upload, and
          payments never run from discovery.
        </p>
        <p className="mt-2 font-mono text-[10px] uppercase text-brass">
          Browser · {mode.replaceAll("-", " ")} · Provider discovery · {discoveryModeLabel()}
        </p>
        <p className="mt-2 text-sm text-paper">
          Discovery targets:{" "}
          {summary.discoveryFamilies.filter((f) => f.enabled).map((f) => f.label).join(" · ") || "none enabled"}
        </p>
        <p className="text-xs text-mute">
          Secondary and adjacent families remain in the capability library with discovery off. Default
          freshness is 7 days.
        </p>
      </div>

      <section className="border border-line bg-panel p-4">
        <h3 className="mb-2 font-mono text-xs uppercase text-brass">Provider discovery</h3>
        {liveExa ? (
          <p className="mb-3 text-sm text-paper">Exa key present — live search is available.</p>
        ) : (
          <p className="mb-3 text-sm text-brass">
            LIVE DISCOVERY NOT RUN — no EXA_API_KEY. Fixture results stay labeled MOCK and are never shown as
            live.
          </p>
        )}
        {discoveryOn ? (
          <form action={runProviderDiscoveryAction}>
            <button type="submit" className="bg-brass px-4 py-2 font-mono text-xs text-ink">
              Run provider discovery
            </button>
          </form>
        ) : (
          <p className="text-sm text-mute">Provider discovery is off in this environment.</p>
        )}
        {lastRun ? (
          <div className="mt-4 space-y-2 text-sm text-mute">
            <p className="font-mono text-[10px] uppercase text-brass">
              Last run {lastRun.live ? "LIVE" : "MOCK"} · {lastRun.status} · {lastRun.createdAt}
            </p>
            <p>
              Profile {lastRun.candidateProfileVersion} · policy {lastRun.decisionPolicyVersion} · config{" "}
              {lastRun.configVersion}
            </p>
            <ul className="space-y-2">
              {lastItems.slice(0, 12).map((item) => (
                <li key={item.id} className="border border-line bg-panel-2 p-2">
                  <p className="text-paper">
                    {item.title ?? "(untitled)"} · {item.company ?? "company unknown"}
                  </p>
                  <p className="font-mono text-[10px] uppercase">
                    {item.live ? "live" : "mock"} · {item.stage} · {item.triageBucket ?? "n/a"} · {item.providerId}
                  </p>
                  {item.opportunityId ? (
                    <Link className="text-brass" href={`/opportunities/${item.opportunityId}`}>
                      Open job
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="border border-line bg-panel p-4">
        <h3 className="mb-2 font-mono text-xs uppercase text-brass">Simulated board assist</h3>
        <form action={startDiscoverySession}>
          <button type="submit" className="border border-brass px-4 py-2 font-mono text-xs text-brass">
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
