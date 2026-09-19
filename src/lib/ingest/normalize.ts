import { jobPostingSchema, type JobPosting } from "@/lib/domain/schemas";
import type { JobSource } from "@/lib/domain/enums";
import { parsePosting } from "@/lib/parse";
import {
  detectCountry,
  detectEmployment,
  detectSeniority,
  detectWorkplace,
  extractSalaryBand,
  extractSkills,
  extractVisaNotes,
  looksClosed,
  parseDeadline,
  parsePostedAt,
} from "@/lib/policy/normalize-fields";
import { nowIso } from "@/lib/time";

export type NormalizeInput = {
  id: string;
  rawText: string;
  url?: string | null;
  source?: JobSource;
  sourceType?: "job_posting" | "recruiter_inbound";
  createdAt?: string;
};

function inferSource(url: string | null | undefined, source?: JobSource): JobSource {
  if (source) return source;
  if (!url) return "MANUAL";
  const host = url.toLowerCase();
  if (host.includes("linkedin.")) return "LINKEDIN";
  if (host.includes("seek.")) return "SEEK";
  if (host.includes("indeed.")) return "INDEED";
  return "URL_IMPORT";
}

export function normalizeJobPosting(input: NormalizeInput): JobPosting {
  const parsed = parsePosting(input.rawText, input.sourceType ?? "job_posting", input.url ?? null);
  const blob = `${parsed.title}\n${parsed.location}\n${parsed.compensation ?? ""}\n${input.rawText}`;
  const salary = extractSalaryBand(blob);
  const postedAt = parsePostedAt(input.rawText);
  const deadline = parseDeadline(input.rawText);
  const workplaceType = detectWorkplace(blob);
  const employmentType = detectEmployment(blob);
  const seniority = detectSeniority(parsed.title, input.rawText);
  const country = detectCountry(parsed.location, input.rawText);
  const skills = extractSkills(input.rawText);
  const visa = extractVisaNotes(input.rawText);
  const closed = looksClosed(input.rawText, deadline ? new Date(deadline) : null);

  let extractionConfidence = 0.4;
  if (parsed.title && parsed.title !== "Untitled posting") extractionConfidence += 0.15;
  if (parsed.company && parsed.company !== "Unknown company") extractionConfidence += 0.1;
  if (parsed.location && parsed.location !== "Unspecified") extractionConfidence += 0.1;
  if (salary.max) extractionConfidence += 0.1;
  if (workplaceType !== "UNKNOWN") extractionConfidence += 0.05;
  if (input.rawText.length > 400) extractionConfidence += 0.1;
  if (input.sourceType === "recruiter_inbound" && input.rawText.length < 500) extractionConfidence = 0.28;

  const now = input.createdAt ?? nowIso();
  const posting: JobPosting = {
    id: input.id,
    userId: "default",
    source: inferSource(input.url, input.source),
    sourceUrl: input.url ?? null,
    sourceExternalId: input.url ? input.url : input.id,
    title: parsed.title,
    company: parsed.company,
    location: parsed.location,
    country,
    workplaceType,
    employmentType,
    seniority,
    postedAt,
    applicationDeadline: deadline,
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryCurrency: salary.currency,
    salaryPeriod: salary.period,
    descriptionRaw: input.rawText.trim(),
    responsibilities: input.rawText
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => /^[-•]/.test(l))
      .map((l) => l.replace(/^[-•]\s*/, "")),
    requiredSkills: skills,
    preferredSkills: skills.filter((s) => /lightgbm|dbt|airflow|react/i.test(s)),
    benefits: [],
    visaRequirements: visa,
    status: closed ? "CLOSED" : "NEW",
    extractionConfidence: Math.min(0.95, extractionConfidence),
    createdAt: now,
    updatedAt: now,
  };

  return jobPostingSchema.parse(posting);
}
