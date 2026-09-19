import { saveProfileAction } from "@/app/actions";
import { bootApp } from "@/lib/boot";
import { getProfile } from "@/lib/db/store";
import { getCandidateRules } from "@/lib/db/store-extended";
import { BULLET_KINDS, DIMENSION_IDS } from "@/lib/jev/types";
import { profileSummary } from "@/lib/canonical/summary";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  await bootApp();
  const profile = await getProfile();
  const rules = await getCandidateRules();
  if (!profile) return <p>No profile.</p>;

  const extraSlots = 2;
  const summary = profileSummary();

  return (
    <main className="max-w-3xl">
      <h2 className="mb-1 text-xl text-paper">Profile</h2>
      <p className="mb-6 text-sm text-mute">
        Canonical career profile {summary.schemaVersion} is the source of truth. Weights still recompose stored Jev answers in code.
      </p>
      <section className="mb-6 grid gap-3 border border-line bg-panel p-4 md:grid-cols-2">
        <p className="font-mono text-[10px] uppercase text-brass md:col-span-2">Canonical summary</p>
        <p className="text-sm text-paper">{summary.fullName} · {summary.workRights}</p>
        <p className="text-sm text-paper">{summary.location} · {summary.workModes.join(" / ")}</p>
        <p className="text-sm text-paper">{summary.compensationStatus}</p>
        <p className="text-sm text-paper">
          {summary.skills} skills · {summary.projects} projects · {summary.evidence} evidence
        </p>
        <div className="md:col-span-2">
          <p className="mb-1 font-mono text-[10px] uppercase text-brass">Active discovery families</p>
          <p className="text-sm text-paper">
            {summary.discoveryFamilies.filter((f) => f.enabled).map((f) => f.label).join(" · ") || "None enabled"}
          </p>
          <p className="mt-1 text-xs text-mute">
            Capability families stay in the library even when discovery is off. Toggle lives in decision-policy.json.
          </p>
        </div>
        <div className="md:col-span-2">
          <p className="mb-1 font-mono text-[10px] uppercase text-brass">Claim safety</p>
          <p className="text-sm text-paper">
            {summary.claimSafety.forbidden} forbidden · {summary.claimSafety.notCurrentlyEvidenced} not currently evidenced ·{" "}
            {summary.claimSafety.qualified} qualified · P02 {summary.claimSafety.p02Excluded ? "excluded" : "review"}
          </p>
          {summary.unresolvedReviewFlags.length ? (
            <ul className="mt-2 list-disc pl-5 text-xs text-mute">
              {summary.unresolvedReviewFlags.slice(0, 4).map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
      <form action={saveProfileAction} className="space-y-6 border border-line bg-panel p-5">
        <label className="block font-mono text-xs text-mute">
          Goals
          <textarea
            name="goals"
            defaultValue={profile.goals}
            rows={5}
            className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm text-paper"
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block font-mono text-xs text-mute">
            Work rights
            <input
              name="workRights"
              defaultValue={profile.constraints.workRights}
              className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm text-paper"
            />
          </label>
          <label className="block font-mono text-xs text-mute">
            Work mode
            <input
              name="workMode"
              defaultValue={profile.constraints.workMode}
              className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm text-paper"
            />
          </label>
          <label className="block font-mono text-xs text-mute">
            Locations (comma or newline)
            <textarea
              name="locations"
              defaultValue={profile.constraints.locations.join("\n")}
              rows={3}
              className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm text-paper"
            />
          </label>
          <label className="block font-mono text-xs text-mute">
            Compensation floor (AUD)
            <input
              name="compensationFloorAud"
              type="number"
              defaultValue={profile.constraints.compensationFloorAud}
              className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm text-paper"
            />
          </label>
        </div>
        <label className="block font-mono text-xs text-mute">
          Seniority band
          <input
            name="seniorityBand"
            defaultValue={profile.constraints.seniorityBand}
            className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm text-paper"
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block font-mono text-xs text-mute">
            Target roles
            <textarea name="targetRoles" defaultValue={rules.targetRoles.join("\n")} rows={4} className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm" />
          </label>
          <label className="block font-mono text-xs text-mute">
            Excluded roles
            <textarea name="excludedRoles" defaultValue={rules.excludedRoles.join("\n")} rows={4} className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm" />
          </label>
          <label className="block font-mono text-xs text-mute">
            Explicit red flags
            <textarea name="explicitRedFlags" defaultValue={rules.explicitRedFlags.join("\n")} rows={4} className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm" />
          </label>
          <label className="block font-mono text-xs text-mute">
            Max job age (days)
            <input name="maxJobAgeDays" type="number" defaultValue={rules.maxJobAgeDays} className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm" />
          </label>
          <label className="block font-mono text-xs text-mute">
            Apply minimum fit
            <input name="applyMin" type="number" step="0.01" defaultValue={rules.applicationRules.applyRecommendationMinimumScore} className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm" />
          </label>
          <label className="block font-mono text-xs text-mute">
            Minimum decision confidence
            <input name="minConfidence" type="number" step="0.01" defaultValue={rules.applicationRules.minimumDecisionConfidence} className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm" />
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 font-mono text-xs uppercase text-brass">Weights (must sum to any positive total)</legend>
          <div className="grid gap-2 md:grid-cols-2">
            {DIMENSION_IDS.map((id) => (
              <label key={id} className="block font-mono text-xs text-mute">
                {id.replaceAll("_", " ")}
                <input
                  name={`weight_${id}`}
                  type="number"
                  step="0.01"
                  defaultValue={profile.weights[id]}
                  className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm text-paper"
                />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-mono text-xs uppercase text-brass">CV evidence bullets</legend>
          {[...profile.bullets, ...Array.from({ length: extraSlots }, () => null)].map((bullet, i) => (
            <div key={bullet?.id ?? `new-${i}`} className="border border-line p-3">
              <input type="hidden" name="bulletId" defaultValue={bullet?.id ?? ""} />
              <div className="mb-2">
                <select
                  name="bulletKind"
                  defaultValue={bullet?.kind ?? "independent"}
                  className="border border-line bg-ink px-2 py-1 font-mono text-xs text-paper"
                >
                  {BULLET_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                name="bulletText"
                defaultValue={bullet?.text ?? ""}
                rows={3}
                className="block w-full border border-line bg-ink px-3 py-2 text-sm text-paper"
                placeholder="Evidence bullet (leave blank to omit)"
              />
            </div>
          ))}
        </fieldset>

        <button type="submit" className="bg-brass px-4 py-2 font-mono text-xs text-ink">
          Save and recompose
        </button>
      </form>
    </main>
  );
}
