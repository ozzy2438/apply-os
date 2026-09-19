import { DEFAULT_CANDIDATE_PROFILE } from "@/lib/domain/defaults";
import type { CandidateEvidence, CandidateProfile } from "@/lib/domain/schemas";
import type { Constraints } from "@/lib/jev/types";
import { PROFILE_VERSION_NUMBER, type CanonicalEvidence, type CanonicalProfile } from "./types";
import { isApplicationExcludedProject } from "./claims";

export function canonicalGoals(profile: CanonicalProfile): string {
  return [profile.career_objectives.primary_objective, ...profile.career_objectives.motivations].join(" ");
}

export function canonicalConstraints(profile: CanonicalProfile): Constraints {
  const loc = profile.constraints.locations;
  return {
    workRights: `${profile.candidate.work_rights.status}; unrestricted right to work in Australia`,
    locations: [loc.base, ...(loc.preferred ?? []), ...(loc.acceptable ?? [])].filter(Boolean) as string[],
    workMode: (profile.constraints.work_modes.preferred ?? ["hybrid", "remote"]).join(" / "),
    compensationFloorAud: profile.constraints.compensation.annual_floor ?? 0,
    seniorityBand: (profile.constraints.seniority.target_levels ?? ["mid", "senior"]).join(", "),
  };
}

export function mapCanonicalToRules(profile: CanonicalProfile): CandidateProfile {
  const titles = profile.role_targets.flatMap((r) => r.acceptable_titles);
  const excluded = profile.constraints.seniority.excluded_levels ?? ["graduate", "intern"];
  const required = profile.skills.filter((s) => s.strength === "strong").slice(0, 8).map((s) => s.name);
  const preferred = profile.skills.filter((s) => s.strength === "working").slice(0, 8).map((s) => s.name);
  return {
    ...DEFAULT_CANDIDATE_PROFILE,
    id: "default",
    version: PROFILE_VERSION_NUMBER,
    targetRoles: [...new Set(titles)],
    excludedRoles: excluded.map((s) => s.replace(/^./, (c) => c.toUpperCase())),
    requiredSkills: required,
    preferredSkills: preferred,
    preferredLocations: ["Melbourne", "Australia", "Victoria"],
    acceptedWorkplaceTypes: ["REMOTE", "HYBRID", "ONSITE"],
    acceptedEmploymentTypes: ["FULL_TIME", "CONTRACT", "PART_TIME"],
    seniorityTargets: ["MID", "SENIOR", "LEAD"],
    minimumSalary: {
      amount: profile.constraints.compensation.floor_known
        ? profile.constraints.compensation.annual_floor
        : null,
      currency: profile.constraints.compensation.currency || "AUD",
      period: "YEAR",
    },
    workAuthorizationCountries: ["AU"],
    visaConstraints: ["Australian citizen; unrestricted AU work rights"],
    industriesOfInterest: ["health", "education", "government", "energy", "financial services"],
    industriesToAvoid: DEFAULT_CANDIDATE_PROFILE.industriesToAvoid,
    explicitRedFlags: [
      "US citizen only",
      "green card",
      "no visa sponsorship",
      "PhD required",
      "security clearance required",
    ],
    applicationRules: {
      ...DEFAULT_CANDIDATE_PROFILE.applicationRules,
    },
    maxJobAgeDays: 45,
  };
}

export function canonicalEvidenceToRows(
  evidence: CanonicalEvidence[],
  profile: CanonicalProfile,
): CandidateEvidence[] {
  const projects = new Map(profile.projects.map((p) => [p.project_id, p]));
  return evidence
    .filter((e) => !(e.subject.type === "project" && isApplicationExcludedProject(e.subject.id)))
    .map((e) => {
      const project = e.subject.type === "project" ? projects.get(e.subject.id) : undefined;
      return {
        id: e.evidence_id,
        candidateProfileId: "canonical",
        type: e.subject.type === "project" ? "PROJECT" : e.subject.type === "experience" ? "WORK_EXPERIENCE" : "SKILL",
        claim: e.claim,
        sourceReference: e.subject.id,
        sourceText: e.source_text,
        skills: [],
        domains: project?.domains ?? [],
        yearsOfExperience: null,
        verified: e.evidence_strength === "verified" || e.evidence_strength === "documented",
        verificationMethod: "CV_EXTRACTED" as const,
      };
    });
}
