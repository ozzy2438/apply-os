import Link from "next/link";
import { notFound } from "next/navigation";
import { bootApp } from "@/lib/boot";
import { getOpportunity } from "@/lib/db/store";
import { latestJobEvaluationV2 } from "@/lib/db/store-extended";
import { resumeStudioEnabled } from "@/lib/resume/flags";
import { latestResumeRun, latestResumeRunByIntent } from "@/lib/resume/persist";
import { approveResumeAction, proposeResumeRewriteAction, reviewExistingResumeAction } from "@/app/resume-actions";
import { pct } from "@/components/Decision";

export const dynamic = "force-dynamic";

export default async function ResumeStudioPage({ params }: { params: Promise<{ id: string }> }) {
  await bootApp();
  if (!resumeStudioEnabled()) notFound();
  const { id } = await params;
  const opportunity = await getOpportunity(id);
  if (!opportunity) notFound();
  const latest = await latestResumeRun(id);
  const run = (await latestResumeRunByIntent(id, "build")) ?? latest;
  const existingRun = await latestResumeRunByIntent(id, "existing");
  const evaluation = await latestJobEvaluationV2(id);
  const roleFit = evaluation?.roleFit ?? evaluation?.semanticSignals.roleFitScore ?? null;
  const snap = run?.snapshot;
  const existingSnap = existingRun?.snapshot.existingReview ? existingRun.snapshot : snap?.existingReview ? snap : null;
  const ready = run?.status === "READY" && run.intent === "build";
  const selectedClaims = snap?.draft
    ? snap.plan
      ? [...new Set([
          ...snap.draft.summaryClaimIds,
          ...snap.draft.skillClaimIds,
          ...snap.draft.entries.flatMap((e) => e.claimIds),
          ...snap.draft.educationClaimIds,
          ...snap.draft.certificationClaimIds,
        ])]
      : []
    : [];

  return (
    <main className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-wider text-mute">
          Resume Studio · {opportunity.company} · {latest?.status ?? run?.status ?? "not started"}
          {run?.intent === "build" && latest && latest.intent !== "build" ? ` · last build ${run.status}` : ""}
        </p>
        <h2 className="text-2xl text-paper">{opportunity.title}</h2>
        <p className="text-sm text-mute">
          Role Fit and Resume Readiness are separate scores. Ready is not Applied.
        </p>
        <Link href={`/opportunities/${id}`} className="mt-2 inline-block font-mono text-xs text-brass">
          Back to fit / evidence
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="border border-line bg-panel p-4">
          <h3 className="mb-2 font-mono text-xs uppercase text-brass">Role Fit</h3>
          <p className="text-2xl text-paper">{roleFit == null ? "—" : pct(roleFit)}</p>
          <p className="mt-1 font-mono text-[10px] text-mute">Job evaluation. Unchanged by this draft.</p>
        </div>
        <div className="border border-line bg-panel p-4">
          <h3 className="mb-2 font-mono text-xs uppercase text-brass">Resume Readiness</h3>
          <p className="text-2xl text-paper">
            {snap?.resumeReadiness == null ? "—" : pct(snap.resumeReadiness)}
          </p>
          <p className="mt-1 font-mono text-[10px] text-mute">
            Presentation quality only · {snap?.reviewLabel ?? "not scored"}
            {snap?.review?.mode === "mock" ? " · MOCK — not live" : ""}
            {snap?.generation?.mode === "template" ? " · TEMPLATE writer" : ""}
          </p>
        </div>
      </section>

      {snap?.plan ? (
        <section className="border border-line bg-panel p-4">
          <h3 className="mb-2 font-mono text-xs uppercase text-brass">Resume plan</h3>
          <p className="font-mono text-[10px] text-mute">
            Entries {snap.plan.entryIds.join(", ") || "none"} · allowed claims {snap.plan.allowedClaimIds.length}
          </p>
          <ul className="mt-3 space-y-1 text-sm text-mute">
            {snap.plan.coverage.map((c) => (
              <li key={c.requirementId}>
                {c.requirementId}: {c.support} · {c.claimIds.length} claim(s)
              </li>
            ))}
          </ul>
          {snap.plan.warnings.length ? (
            <ul className="mt-3 list-disc pl-5 text-sm text-clay">
              {snap.plan.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {snap?.guard ? (
        <section className="border border-line bg-panel p-4">
          <h3 className="mb-2 font-mono text-xs uppercase text-brass">Claim Guard</h3>
          <p className={`font-mono text-xs ${snap.guard.passed ? "text-moss" : "text-clay"}`}>
            {snap.guard.passed ? "Passed" : "Blocked"} · draft {snap.guard.draftHash.slice(0, 12)}
          </p>
          {snap.guard.errors.length ? (
            <ul className="mt-2 list-disc pl-5 text-sm text-clay">
              {snap.guard.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
          {snap.guard.warnings.length ? (
            <ul className="mt-2 list-disc pl-5 text-sm text-mute">
              {snap.guard.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {snap?.pendingReview.length ? (
        <section className="border border-line bg-panel p-4">
          <h3 className="mb-2 font-mono text-xs uppercase text-brass">Pending claim review</h3>
          <ul className="space-y-1 text-sm text-mute">
            {snap.pendingReview.slice(0, 12).map((p) => (
              <li key={p.id}>
                <span className="font-mono text-[10px] text-brass">{p.id}</span> {p.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {snap?.review ? (
        <section className="border border-line bg-panel p-4">
          <h3 className="mb-2 font-mono text-xs uppercase text-brass">Resume QA</h3>
          <p className="font-mono text-xs text-paper">
            {snap.review.assessment} · {snap.reviewLabel}
          </p>
          {snap.review.status === "unavailable" ? (
            <p className="mt-2 text-sm text-clay">
              QA is unavailable. No mock score is shown as live. Ready stays closed without a current live review.
            </p>
          ) : (
            <ul className="mt-3 space-y-1 font-mono text-[10px] text-mute">
              {snap.review.dimensions.map((d) => (
                <li key={d.id}>
                  {d.id.replaceAll("_", " ")} · {d.raw.toFixed(1)} / 4 · conf {pct(d.confidence)}
                  {d.uncertain ? " · uncertain" : ""}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {snap?.renderedText ? (
        <section className="border border-line bg-panel p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-mono text-xs uppercase text-brass">Preview</h3>
            {run?.artifactHash ? (
              <a href={`/api/resume/${id}`} className="font-mono text-xs text-brass">
                Download measured PDF
              </a>
            ) : null}
          </div>
          {snap.layout ? (
            <p className="mb-2 font-mono text-[10px] text-mute">
              PDF {snap.layout.pageCount} page(s) · min {snap.layout.minFontSizePt}pt · measured{" "}
              {snap.layout.measured ? "yes" : "no"} · extract match {snap.layout.extractedTextMatches ? "yes" : "no"}
            </p>
          ) : null}
          <pre className="whitespace-pre-wrap border border-line bg-ink p-3 text-sm text-paper">{snap.renderedText}</pre>
        </section>
      ) : null}

      {existingSnap?.existingReview ? (
        <p className="border border-brass-dim bg-panel-2 px-3 py-2 text-sm text-brass">
          Existing-CV path: claim verification {existingSnap.existingReview.claimVerification}. Ready is not
          available from a presentation-only review.
        </p>
      ) : null}

      {snap?.warnings.length ? (
        <section className="border border-line bg-panel p-4">
          <h3 className="mb-2 font-mono text-xs uppercase text-brass">Warnings</h3>
          <ul className="list-disc pl-5 text-sm text-mute">
            {snap.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {run?.intent === "build" && snap?.draft && selectedClaims.length ? (
        <section className="border border-line bg-panel p-4">
          <h3 className="mb-2 font-mono text-xs uppercase text-brass">Propose safer wording</h3>
          <p className="mb-3 text-sm text-mute">
            Rewrites stay pending. They cannot change dates, titles, metrics, or auto-approve themselves.
          </p>
          <form action={proposeResumeRewriteAction.bind(null, id)} className="space-y-3">
            <label className="block font-mono text-xs text-mute">
              Claim
              <select name="originalClaimId" className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm text-paper">
                {selectedClaims.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              name="rewriteText"
              rows={3}
              className="w-full border border-line bg-ink px-3 py-2 text-sm"
              placeholder="Proposed wording. Source facts must stay the same."
            />
            <button type="submit" className="border border-line px-3 py-2 font-mono text-xs">
              Submit pending rewrite
            </button>
          </form>
        </section>
      ) : null}

      {run?.intent === "build" && snap?.draft && !ready ? (
        <section className="border border-line bg-panel p-4">
          <h3 className="mb-2 font-mono text-xs uppercase text-brass">Human approval</h3>
          <p className="mb-3 text-sm text-mute">
            Approving marks this resume Ready. It does not apply, email, or upload anything.
          </p>
          <form action={approveResumeAction.bind(null, id)} className="space-y-3">
            <label className="flex items-center gap-2 font-mono text-xs text-mute">
              <input type="checkbox" name="acceptedWarnings" /> I have read the warnings on this exact draft
            </label>
            <button type="submit" className="border border-brass px-3 py-2 font-mono text-xs text-brass">
              Approve this measured PDF
            </button>
          </form>
          {ready ? <p className="mt-2 font-mono text-xs text-moss">Ready</p> : null}
        </section>
      ) : null}

      {ready ? (
        <p className="font-mono text-xs text-moss">
          Resume Ready for artifact {run?.artifactHash?.slice(0, 12)}. Applied is a separate pipeline status.
        </p>
      ) : null}

      <section className="border border-line bg-panel p-4">
        <h3 className="mb-2 font-mono text-xs uppercase text-brass">Check an existing CV</h3>
        <p className="mb-3 text-sm text-mute">
          Presentation QA only. A high score is not factual verification and cannot mark Ready.
        </p>
        <form action={reviewExistingResumeAction.bind(null, id)} className="space-y-3">
          <textarea
            name="existingResume"
            rows={6}
            className="w-full border border-line bg-ink px-3 py-2 text-sm"
            placeholder="Paste the CV text. Contact details are redacted before any model call."
          />
          <button type="submit" className="border border-line px-3 py-2 font-mono text-xs">
            Review existing text
          </button>
        </form>
      </section>
    </main>
  );
}
