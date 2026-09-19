import { bootApp } from "@/lib/boot";
import { getOpportunity } from "@/lib/db/store";
import { latestResumeRun, loadResumeArtifact } from "@/lib/resume/persist";
import { resumeStudioEnabled } from "@/lib/resume/flags";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  await bootApp();
  if (!resumeStudioEnabled()) return new Response("off", { status: 404 });
  const { jobId } = await context.params;
  const opportunity = await getOpportunity(jobId);
  if (!opportunity) return new Response("not found", { status: 404 });
  const run = await latestResumeRun(jobId);
  if (!run) return new Response("no resume", { status: 404 });
  const bytes = loadResumeArtifact(run.id);
  if (!bytes) return new Response("no artifact", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="resume-${jobId.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
