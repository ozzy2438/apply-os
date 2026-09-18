import { ingestOpportunity } from "@/app/actions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function IngestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function action(formData: FormData) {
    "use server";
    const result = await ingestOpportunity(formData);
    if ("id" in result) redirect(`/opportunities/${result.id}`);
    redirect(`/ingest?error=${encodeURIComponent(result.error)}`);
  }

  return (
    <main className="max-w-3xl">
      <h2 className="mb-1 text-xl text-paper">Ingest</h2>
      <p className="mb-6 text-sm text-mute">
        Paste a posting or recruiter note. Optional URL fetch is best-effort. One batched Jev call follows.
      </p>
      {error ? <p className="mb-4 border border-clay px-3 py-2 text-sm text-clay">{error}</p> : null}
      <form action={action} className="space-y-4 border border-line bg-panel p-5">
        <label className="block font-mono text-xs text-mute">
          Source
          <select
            name="sourceType"
            className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm text-paper"
            defaultValue="job_posting"
          >
            <option value="job_posting">Job posting</option>
            <option value="recruiter_inbound">Recruiter inbound</option>
          </select>
        </label>
        <label className="block font-mono text-xs text-mute">
          URL (optional)
          <input
            name="url"
            type="url"
            placeholder="https://"
            className="mt-1 block w-full border border-line bg-ink px-3 py-2 text-sm text-paper"
          />
        </label>
        <label className="block font-mono text-xs text-mute">
          Raw text
          <textarea
            name="rawText"
            required
            rows={16}
            className="mt-1 block w-full border border-line bg-ink px-3 py-2 font-mono text-sm text-paper"
            placeholder="Title: ...\nCompany: ...\nLocation: ...\n"
          />
        </label>
        <button type="submit" className="bg-brass px-4 py-2 font-mono text-xs text-ink hover:bg-paper">
          Score with Jev
        </button>
      </form>
    </main>
  );
}
