import { addJobNote, approveSubmit, changeStatus, generateLetter } from "@/app/actions";
import { DistBars, FitMeter, GateChips, pct } from "@/components/Decision";
import { bootApp } from "@/lib/boot";
import {
  getOpportunity,
  latestCoverLetter,
  latestEvaluation,
  listStatusEvents,
} from "@/lib/db/store";
import { getCanonicalJob, hasApproval, latestJobEvaluationV2, listAudits, listNotes } from "@/lib/db/store-extended";
import { explanationFromEvaluation } from "@/lib/policy/compose";
import { STATUSES } from "@/lib/jev/types";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  await bootApp();
  const { id } = await params;
  const opportunity = await getOpportunity(id);
  if (!opportunity) notFound();
  const evaluation = await latestEvaluation(id);
  const letter = await latestCoverLetter(id);
  const events = await listStatusEvents(id);
  const composed = evaluation?.composed;
  const v2 = await latestJobEvaluationV2(id);
  const canonical = await getCanonicalJob(id);
  const notes = await listNotes(id);
  const audits = await listAudits(8, id);
  const submitApproved = await hasApproval(id, "SUBMIT");

  return (
    <main className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-wider text-mute">
          {opportunity.company} · {opportunity.status} · {opportunity.sourceType.replaceAll("_", " ")}
        </p>
        <h2 className="text-2xl text-paper">{opportunity.title}</h2>
        <p className="text-sm text-mute">
          {opportunity.location}
          {opportunity.compensation ? ` · ${opportunity.compensation}` : ""}
        </p>
      </div>

      {composed ? (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="border border-line bg-panel p-4">
            <h3 className="mb-3 font-mono text-xs uppercase text-brass">Judgment</h3>
            <FitMeter fit={composed.fit} label={composed.label} />
            <p className="mt-3 font-mono text-xs text-paper">
              Action {composed.action.replaceAll("_", " ")} · confidence {pct(composed.actionConfidence)} ·{" "}
              {composed.confidenceBand}
              {composed.deskEligible ? " · desk eligible" : ""}
            </p>
            <div className="mt-3">
              <p className="mb-1 font-mono text-[10px] text-mute">Action distribution</p>
              <DistBars probabilities={composed.actionProbabilities} />
            </div>
            <div className="mt-4">
              <GateChips composed={composed} />
            </div>
            {evaluation?.demo ? (
              <p className="mt-3 font-mono text-[10px] text-brass">Model {evaluation.model} (demo)</p>
            ) : (
              <p className="mt-3 font-mono text-[10px] text-mute">Model {evaluation?.model}</p>
            )}
          </div>
          <div className="border border-line bg-panel p-4">
            <h3 className="mb-3 font-mono text-xs uppercase text-brass">Dimensions (code-weighted)</h3>
            <div className="space-y-3">
              {composed.dimensions.map((d) => (
                <div key={d.id}>
                  <div className="mb-1 flex justify-between font-mono text-[10px] text-mute">
                    <span>
                      {d.id.replaceAll("_", " ")} · w {d.weight.toFixed(2)}
                    </span>
                    <span className="text-paper">
                      {d.score.toFixed(2)} / 4 → {pct(d.normalized)}
                    </span>
                  </div>
                  <DistBars probabilities={d.probabilities} />
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {v2 ? (
        <section className="border border-line bg-panel p-4">
          <h3 className="mb-2 font-mono text-xs uppercase text-brass">Structured explanation</h3>
          {v2.triage ? (
            <p className="mb-2 font-mono text-[10px] uppercase text-brass">
              Triage {v2.triage} · roleFit {pct(v2.roleFit ?? v2.semanticSignals.roleFitScore)} · coverage{" "}
              {pct(v2.evidenceCoverage ?? v2.semanticSignals.skillsFitScore)} · completeness{" "}
              {pct(v2.informationCompleteness ?? 1 - v2.semanticSignals.missingInformationProbability)} · decision{" "}
              {pct(v2.decisionConfidence ?? v2.semanticSignals.recommendationConfidence)}
            </p>
          ) : null}
          <pre className="whitespace-pre-wrap text-sm text-paper">{explanationFromEvaluation(v2)}</pre>
          {v2.deterministicResults.hardBlockers.length ? (
            <ul className="mt-3 list-disc pl-5 text-sm text-clay">
              {v2.deterministicResults.hardBlockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
          {canonical ? (
            <p className="mt-3 font-mono text-[10px] text-mute">
              Extract confidence {pct(canonical.extractionConfidence)} · {canonical.workplaceType} ·{" "}
              {canonical.seniority} · {canonical.country ?? "country unknown"}
              {canonical.sourceUrl ? (
                <>
                  {" "}
                  ·{" "}
                  <a className="text-brass" href={canonical.sourceUrl} target="_blank" rel="noreferrer">
                    Open source
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="border border-line bg-panel p-4">
        <h3 className="mb-3 font-mono text-xs uppercase text-brass">Application checklist</h3>
        <ul className="space-y-1 font-mono text-xs text-mute">
          <li>{v2 && v2.finalDecision !== "SKIP" ? "✓" : "○"} Policy did not hard-skip</li>
          <li>{letter?.check.ready ? "✓" : "○"} Cover letter claims verified (Ready gate)</li>
          <li>{submitApproved ? "✓" : "○"} Explicit submit / Applied approval</li>
          <li>○ No automatic submit — you send it</li>
        </ul>
        <form action={approveSubmit.bind(null, opportunity.id)} className="mt-3">
          <button type="submit" className="border border-brass px-3 py-1.5 font-mono text-xs text-brass">
            I confirm I will submit this myself
          </button>
        </form>
      </section>

      <section className="border border-line bg-panel p-4">
        <h3 className="mb-3 font-mono text-xs uppercase text-brass">Pipeline status</h3>
        <form action={changeStatus.bind(null, opportunity.id)} className="flex flex-wrap items-end gap-3">
          <label className="font-mono text-xs text-mute">
            Status
            <select
              name="status"
              defaultValue={opportunity.status}
              className="mt-1 block border border-line bg-ink px-3 py-2 text-sm text-paper"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="border border-brass px-3 py-2 font-mono text-xs text-brass">
            Save status
          </button>
        </form>
        <ul className="mt-4 space-y-1 font-mono text-[10px] text-mute">
          {events.map((event) => (
            <li key={event.id}>
              {event.at} · {event.status}
              {event.note ? ` · ${event.note}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-line bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-mono text-xs uppercase text-brass">Cover letter · citation gate</h3>
          <form action={generateLetter.bind(null, opportunity.id)}>
            <button type="submit" className="border border-line px-3 py-1.5 font-mono text-xs hover:border-brass">
              Draft + check
            </button>
          </form>
        </div>
        {letter ? (
          <div className="grid gap-4 md:grid-cols-2">
            <pre className="whitespace-pre-wrap border border-line bg-ink p-3 text-sm text-paper">{letter.body}</pre>
            <div>
              <p className={`font-mono text-xs ${letter.check.ready ? "text-moss" : "text-clay"}`}>
                {letter.check.ready ? "Ready to send" : "Blocked"}
              </p>
              {letter.check.blockers.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-clay">
                  {letter.check.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : null}
              <ul className="mt-3 space-y-2">
                {letter.check.citations.map((c, i) => (
                  <li key={i} className="border border-line p-2 text-xs">
                    <p className="text-paper">{c.claim.claim}</p>
                    <p className="font-mono text-[10px] text-mute">
                      {c.verdict} · {c.status}
                      {c.confidence !== null ? ` · conf ${pct(c.confidence)}` : ""} ·{" "}
                      {c.auto ? "auto" : "review"}
                    </p>
                    <p className="mt-1 text-[11px] text-mute">quote: {c.claim.quote}</p>
                  </li>
                ))}
              </ul>
              <ul className="mt-3 font-mono text-[10px] text-mute">
                {letter.check.guards.map((g) => (
                  <li key={g.id}>
                    {g.id.replaceAll("_", " ")} noul {pct(g.noul)} {g.failed ? "FAIL" : "ok"}
                  </li>
                ))}
              </ul>
              {letter.check.atomic?.length ? (
                <ul className="mt-4 space-y-2">
                  {letter.check.atomic.map((a, i) => (
                    <li key={i} className="border border-line p-2 text-xs">
                      <p className="font-mono text-[10px] uppercase text-brass">
                        {a.status} · {a.category} · {a.requiredAction}
                      </p>
                      <p className="text-paper">{a.explanation}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-mute">No letter yet. Draft one to run citation and guard checks.</p>
        )}
      </section>

      <section className="border border-line bg-panel p-4">
        <h3 className="mb-2 font-mono text-xs uppercase text-brass">Local note</h3>
        <form action={addJobNote.bind(null, opportunity.id)} className="mb-3 flex gap-2">
          <input
            name="note"
            className="flex-1 border border-line bg-ink px-3 py-2 text-sm"
            placeholder="Why this is interesting, or what is missing"
          />
          <button type="submit" className="border border-line px-3 py-2 font-mono text-xs">
            Add
          </button>
        </form>
        <ul className="space-y-1 text-sm text-mute">
          {notes.map((n) => (
            <li key={n.id}>
              {n.createdAt} — {n.body}
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-line bg-panel p-4">
        <h3 className="mb-2 font-mono text-xs uppercase text-brass">Decision timeline</h3>
        <ul className="space-y-1 font-mono text-[10px] text-mute">
          {audits.map((a) => (
            <li key={a.id}>
              {a.createdAt} · {a.eventType} · {a.modelProvider ?? "policy"}
            </li>
          ))}
        </ul>
        <Link href="/audit" className="mt-2 inline-block text-xs text-brass">
          Full audit
        </Link>
      </section>

      <section className="border border-line bg-panel p-4">
        <h3 className="mb-2 font-mono text-xs uppercase text-brass">Source</h3>
        <pre className="whitespace-pre-wrap font-mono text-xs text-mute">{opportunity.rawText}</pre>
      </section>
    </main>
  );
}
