import type { CandidateProfile, DeterministicResults, JobPosting } from "@/lib/domain/schemas";
import { jobHasPlausibleRoleRelevance } from "@/lib/canonical/retrieve";
import type { CanonicalProfile, DecisionPolicy, TriageBucket } from "@/lib/canonical/types";

const REGULATORY =
  /non-negotiable|regulatory|legally required|must hold (a |an )?(current )?(licence|license|registration)|cannot be substituted|statutory/;

const YEARS_IN_TITLE =
  /(?:at least|minimum|min\.?)\s+(\d+)\+?\s+years?.{0,60}?(?:as a |as an |in (?:the )?role of |as )([A-Za-z][A-Za-z/ ]{2,40})/i;

export type TriageResult = {
  bucket: TriageBucket;
  reasons: string[];
  yearsInTitle: boolean;
  regulatoryYears: boolean;
  roleRelevant: boolean;
};

function yearsInTitleSignal(job: JobPosting): { hit: boolean; regulatory: boolean; snippet: string | null } {
  const hay = `${job.title}\n${job.descriptionRaw}`;
  const match = hay.match(YEARS_IN_TITLE);
  if (!match) return { hit: false, regulatory: false, snippet: null };
  const window = hay.slice(Math.max(0, (match.index ?? 0) - 80), (match.index ?? 0) + 160);
  return { hit: true, regulatory: REGULATORY.test(window) || REGULATORY.test(hay), snippet: match[0] };
}

export function extraHardConstraints(job: JobPosting, profile: CanonicalProfile): string[] {
  const hay = `${job.title}\n${job.descriptionRaw}`.toLowerCase();
  const hits: string[] = [];
  if (/permanent relocation|relocate (to |outside )|must relocate/.test(hay) && /victoria|melbourne/.test(hay) === false) {
    if (/outside victoria|outside australia|relocate to/.test(hay)) hits.push("Role requires permanent relocation outside Victoria.");
  }
  if (/security clearance|nv1|nv2|baseline clearance|tspv/.test(hay) && /will sponsor|sponsorship available/.test(hay) === false) {
    hits.push("Role requires a security clearance the candidate does not hold.");
  }
  if (/\b(phd|postgraduate qualification|master'?s degree required)\b/.test(hay) && /or equivalent|equivalent experience/.test(hay) === false) {
    if (/\bphd (required|essential|mandatory)\b|postgraduate (required|essential)/.test(hay)) {
      hits.push("Role requires a postgraduate qualification as a stated non-negotiable.");
    }
  }
  if (/professional registration required|must be registered|current (licence|license) required/.test(hay)) {
    hits.push("Role requires a professional registration or licence not held.");
  }
  void profile;
  return hits;
}

export function triageJob(input: {
  job: JobPosting;
  rules: CandidateProfile;
  profile: CanonicalProfile;
  policy: DecisionPolicy;
  deterministic: DeterministicResults;
}): TriageResult {
  const reasons: string[] = [];
  const extra = extraHardConstraints(input.job, input.profile);
  const years = yearsInTitleSignal(input.job);
  const roleRelevant = jobHasPlausibleRoleRelevance(input.job, input.profile);

  if (input.deterministic.hardBlockers.length) {
    reasons.push(...input.deterministic.hardBlockers);
    return { bucket: "HARD_REJECT", reasons, yearsInTitle: years.hit, regulatoryYears: years.regulatory, roleRelevant };
  }
  if (extra.length && years.regulatory === false) {
    reasons.push(...extra);
    return { bucket: "HARD_REJECT", reasons, yearsInTitle: years.hit, regulatoryYears: years.regulatory, roleRelevant };
  }
  if (years.hit && years.regulatory) {
    reasons.push(`Regulatory / non-negotiable titled-years requirement: ${years.snippet}`);
    return { bucket: "HARD_REJECT", reasons, yearsInTitle: true, regulatoryYears: true, roleRelevant };
  }
  if (years.hit) {
    reasons.push(`Stated years-in-title requirement routed to human review: ${years.snippet}`);
    return { bucket: "HUMAN_REVIEW", reasons, yearsInTitle: true, regulatoryYears: false, roleRelevant };
  }
  if (!roleRelevant) {
    reasons.push("Title is not a plausible match for any capability family — archive, do not deep-review.");
    return { bucket: "LOW_PRIORITY_ARCHIVE", reasons, yearsInTitle: false, regulatoryYears: false, roleRelevant };
  }
  reasons.push("Plausible role-family relevance; retrieve a relevant evidence subset before Jev.");
  return { bucket: "DEEP_REVIEW", reasons, yearsInTitle: false, regulatoryYears: false, roleRelevant };
}
