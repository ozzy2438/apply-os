import { bootApp } from "@/lib/boot";
import { listEvidence } from "@/lib/db/store-extended";
import { saveEvidenceAction } from "@/app/actions";
import { EVIDENCE_TYPES, VERIFICATION_METHODS } from "@/lib/domain/enums";
import { profileSummary } from "@/lib/canonical/summary";

export const dynamic = "force-dynamic";

export default async function EvidencePage() {
  await bootApp();
  const items = await listEvidence();
  const summary = profileSummary();

  return (
    <main className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl text-paper">Evidence library</h2>
        <p className="text-sm text-mute">
          Cover-letter claims can only be Ready when they match verified evidence. Confirm new items yourself —
          the model does not invent them.
        </p>
        <p className="mt-2 font-mono text-[10px] uppercase text-brass">
          Canonical · {summary.projects} projects · {summary.evidence} evidence · {summary.applicationSafeEvidence} application-safe · P02 excluded
        </p>
        <p className="text-xs text-mute">
          The 64-project library stays in candidate-profile.json. This page is for confirmed overlays, not a JSON dump.
        </p>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <article key={item.id} className="border border-line bg-panel p-4">
            <p className="font-mono text-[10px] uppercase text-brass">
              {item.type} · {item.verificationMethod} · {item.verified ? "verified" : "unverified"}
            </p>
            <p className="mt-1 text-paper">{item.claim}</p>
            <p className="mt-2 text-xs text-mute">{item.sourceText}</p>
            <p className="mt-2 font-mono text-[10px] text-mute">{item.skills.join(", ")}</p>
          </article>
        ))}
      </div>
      <form action={saveEvidenceAction} className="space-y-3 border border-line bg-panel p-4">
        <h3 className="font-mono text-xs uppercase text-brass">Confirm a new evidence item</h3>
        <input type="hidden" name="verified" value="true" />
        <label className="block font-mono text-xs text-mute">
          Type
          <select name="type" className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm">
            {EVIDENCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block font-mono text-xs text-mute">
          Claim
          <textarea name="claim" required rows={3} className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm" />
        </label>
        <label className="block font-mono text-xs text-mute">
          Source text
          <textarea name="sourceText" rows={3} className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm" />
        </label>
        <label className="block font-mono text-xs text-mute">
          Skills (comma)
          <input name="skills" className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm" />
        </label>
        <label className="block font-mono text-xs text-mute">
          Verification
          <select name="verificationMethod" className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm">
            {VERIFICATION_METHODS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="bg-brass px-4 py-2 font-mono text-xs text-ink">
          Save evidence
        </button>
      </form>
    </main>
  );
}
