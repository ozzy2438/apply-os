import { extractJobRequirements, matchRequirementsToEvidence } from "@/lib/canonical/requirements";
import { detectRoleFamilyIds, retrieveRelevantEvidence } from "@/lib/canonical/retrieve";
import { loadCanonicalBundle } from "@/lib/canonical/load";
import { isApplicationExcludedProject } from "@/lib/canonical/claims";
import type { JobPosting } from "@/lib/domain/schemas";
import { sha256 } from "@/lib/domain/hash";
import { buildClaimBank, claimsForEvidenceIds } from "./claims-bank";
import { hash } from "./identity";
import type { Requirement, RequirementMatch, ResumeContext } from "./types";
import { assertContext } from "./validation";

export const DEFAULT_TENANT_ID = "default";
export const DEFAULT_CANDIDATE_ID = "default";

function publicUrl(raw: string | undefined, label: string): { label: string; url: string } | null {
  if (!raw) return null;
  const url = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return { label, url: parsed.href };
  } catch {
    return null;
  }
}

export function profileSnapshotHash(): string {
  const { profile, policy } = loadCanonicalBundle();
  return hash({
    schema: profile.schema_version,
    candidate: profile.candidate,
    projects: profile.projects,
    evidence: profile.evidence,
    claim_policy: profile.claim_policy,
    education: profile.education,
    certifications: profile.certifications,
    skills: profile.skills,
    policy: policy.policy_version,
  });
}

export function decisionPolicySnapshotHash(): string {
  const { policy } = loadCanonicalBundle();
  return hash(policy);
}

export function jobSnapshotHash(job: JobPosting): string {
  return sha256(`${job.title}|${job.company ?? ""}|${job.descriptionRaw}`);
}

export function buildResumeContext(input: {
  job: JobPosting;
  tenantId?: string;
  candidateId?: string;
}): { context: ResumeContext; pendingReview: Array<{ id: string; reason: string }>; roleFamilyId: string } {
  const { profile, policy } = loadCanonicalBundle();
  const profileHash = profileSnapshotHash();
  const decisionPolicyHash = hash(policy);
  const jobHash = jobSnapshotHash(input.job);
  const families = detectRoleFamilyIds(input.job, profile);
  const roleFamilyId = families[0] ?? "data_analytics_insights";

  const requirements = extractJobRequirements(input.job);
  const quotes = requirements.map((r) => r.text);
  const advertisement = [
    `${input.job.title} at ${input.job.company ?? "unspecified organisation"}`,
    input.job.descriptionRaw,
    "Requirements:",
    ...quotes.map((q) => `- ${q}`),
  ].join("\n");

  const resumeRequirements: Requirement[] = requirements.map((r) => ({
    id: r.id,
    text: r.text,
    importance: r.importance,
    sourceQuote: r.text,
  }));

  const bank = buildClaimBank(profile, profileHash);
  const retrieved = retrieveRelevantEvidence(input.job, profile);
  const matches = matchRequirementsToEvidence({
    requirements,
    evidence: retrieved.evidence.filter((e) => !(e.subject.type === "project" && isApplicationExcludedProject(e.subject.id))),
    projects: retrieved.projects,
    profile,
  });

  const resumeMatches: RequirementMatch[] = matches.map((m) => {
    const fromEvidence = claimsForEvidenceIds(bank.claims, m.evidenceIds);
    const fromProjects = bank.claims
      .filter((c) => (c.kind === "bullet" || c.kind === "skill") && m.projectIds.includes(c.subject.id))
      .map((c) => c.id);
    return {
      requirementId: m.requirementId,
      claimIds: [...new Set([...fromEvidence, ...fromProjects])],
      support: m.support,
    };
  });

  const loc = profile.candidate.location;
  const links = [
    publicUrl(profile.candidate.links?.linkedin, "LinkedIn"),
    publicUrl(profile.candidate.links?.github, "GitHub"),
    publicUrl(profile.candidate.links?.portfolio, "Portfolio"),
  ].filter((x): x is { label: string; url: string } => Boolean(x));

  const context: ResumeContext = {
    scope: {
      tenantId: input.tenantId ?? DEFAULT_TENANT_ID,
      candidateId: input.candidateId ?? DEFAULT_CANDIDATE_ID,
      jobId: input.job.id,
      profileVersion: profile.schema_version,
      profileHash,
      decisionPolicyVersion: policy.policy_version,
      decisionPolicyHash,
      jobHash,
    },
    header: {
      fullName: profile.candidate.full_name,
      location: `${loc.city}, ${loc.state}`,
      email: profile.candidate.contact?.email ?? null,
      phone: profile.candidate.contact?.phone ?? null,
      links,
    },
    job: {
      title: input.job.title,
      organisation: input.job.company ?? "Unspecified organisation",
      roleFamilyId,
      advertisement,
      requirements: resumeRequirements,
    },
    entities: bank.entities,
    evidence: bank.evidence,
    claims: bank.claims,
    matches: resumeMatches,
  };

  assertContext(context);
  return { context, pendingReview: bank.pendingReview, roleFamilyId };
}
