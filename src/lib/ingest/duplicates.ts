import { jobFingerprint } from "@/lib/domain/hash";
import type { DuplicateStatus } from "@/lib/domain/enums";
import type { JobPosting } from "@/lib/domain/schemas";

export function classifyDuplicate(job: JobPosting, existing: JobPosting[]): DuplicateStatus {
  const fp = jobFingerprint({
    title: job.title,
    company: job.company,
    url: job.sourceUrl,
    raw: job.descriptionRaw,
  });
  for (const other of existing) {
    if (other.id === job.id) continue;
    if (job.sourceUrl && other.sourceUrl && job.sourceUrl === other.sourceUrl) return "DUPLICATE";
    if (job.sourceExternalId && other.sourceExternalId && job.sourceExternalId === other.sourceExternalId) {
      return "DUPLICATE";
    }
    const otherFp = jobFingerprint({
      title: other.title,
      company: other.company,
      url: other.sourceUrl,
      raw: other.descriptionRaw,
    });
    if (fp === otherFp) return "DUPLICATE";
    const sameTitleCompany =
      job.title.trim().toLowerCase() === other.title.trim().toLowerCase() &&
      (job.company ?? "").trim().toLowerCase() === (other.company ?? "").trim().toLowerCase();
    if (sameTitleCompany) return "POSSIBLE_DUPLICATE";
  }
  return "UNIQUE";
}
