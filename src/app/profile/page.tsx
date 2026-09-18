import { saveProfileAction } from "@/app/actions";
import { bootApp } from "@/lib/boot";
import { getProfile } from "@/lib/db/store";
import { BULLET_KINDS, DIMENSION_IDS } from "@/lib/jev/types";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  await bootApp();
  const profile = await getProfile();
  if (!profile) return <p>No profile.</p>;

  const extraSlots = 2;

  return (
    <main className="max-w-3xl">
      <h2 className="mb-1 text-xl text-paper">Profile</h2>
      <p className="mb-6 text-sm text-mute">
        Changing weights recomposes stored Jev answers in code. It does not call the model again.
      </p>
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
