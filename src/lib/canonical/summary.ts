import { loadCanonicalBundle } from "./load";
import { isApplicationExcludedProject } from "./claims";

export type ProfileSummary = {
  schemaVersion: string;
  policyVersion: string;
  fullName: string;
  workRights: string;
  location: string;
  workModes: string[];
  compensationStatus: string;
  skills: number;
  projects: number;
  evidence: number;
  applicationSafeEvidence: number;
  discoveryFamilies: Array<{ id: string; label: string; enabled: boolean }>;
  unresolvedReviewFlags: string[];
  claimSafety: {
    forbidden: number;
    notCurrentlyEvidenced: number;
    qualified: number;
    p02Excluded: boolean;
  };
};

export function profileSummary(): ProfileSummary {
  const { profile, policy } = loadCanonicalBundle();
  const flags = [
    ...profile.projects.flatMap((p) => p.review_flags ?? []),
    ...profile.claim_policy.uncertain_facts.map((f) => f.item),
    ...profile.certifications.flatMap((c) => c.review_flags ?? []),
  ];
  return {
    schemaVersion: profile.schema_version,
    policyVersion: policy.policy_version,
    fullName: profile.candidate.full_name,
    workRights: profile.candidate.work_rights.status,
    location: `${profile.candidate.location.city}, ${profile.candidate.location.state}`,
    workModes: profile.constraints.work_modes.preferred ?? [],
    compensationStatus: profile.constraints.compensation.floor_known
      ? `Floor ${profile.constraints.compensation.annual_floor} ${profile.constraints.compensation.currency}`
      : "No stated floor — pay uncertainty routes to review",
    skills: profile.skills.length,
    projects: profile.projects.length,
    evidence: profile.evidence.length,
    applicationSafeEvidence: profile.evidence.filter(
      (e) => !(e.subject.type === "project" && isApplicationExcludedProject(e.subject.id)),
    ).length,
    discoveryFamilies: policy.active_discovery_targets.map((t) => ({
      id: t.role_family_id,
      label: t.role_family,
      enabled: t.enabled_for_discovery,
    })),
    unresolvedReviewFlags: flags.slice(0, 8),
    claimSafety: {
      forbidden: profile.claim_policy.forbidden_claims.length,
      notCurrentlyEvidenced: profile.claim_policy.not_currently_evidenced.length,
      qualified: profile.claim_policy.qualified_claims.length,
      p02Excluded: profile.projects.some((p) => p.project_id === "P02" && p.cv_usage === "excluded"),
    },
  };
}
