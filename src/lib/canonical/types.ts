export const CANONICAL_SCHEMA_VERSION = "1.1.0";
export const EVALUATION_SCHEMA_VERSION = "1.1.0";
export const PROFILE_VERSION_NUMBER = 11;

export const EVIDENCE_SUBJECT_TYPES = [
  "project",
  "experience",
  "education",
  "certification",
  "candidate_fact",
] as const;
export type EvidenceSubjectType = (typeof EVIDENCE_SUBJECT_TYPES)[number];

export const TRIAGE_BUCKETS = [
  "HARD_REJECT",
  "LOW_PRIORITY_ARCHIVE",
  "DEEP_REVIEW",
  "HUMAN_REVIEW",
] as const;
export type TriageBucket = (typeof TRIAGE_BUCKETS)[number];

export const APPLICATION_EXCLUDED_PROJECTS = ["P02"] as const;

export type EvidenceSubject = { type: EvidenceSubjectType; id: string };

export type CanonicalEvidence = {
  evidence_id: string;
  subject: EvidenceSubject;
  claim: string;
  source_text: string;
  source_document: string;
  source_locator?: string;
  evidence_strength: string;
};

export type CanonicalProject = {
  project_id: string;
  name: string;
  engagement_type: string;
  start_date: string | null;
  end_date: string | null;
  date_certainty: string;
  domains: string[];
  technologies: string[];
  keywords: string[];
  role_families_supported: string[];
  role_family_ids?: string[];
  related_project_ids: string[];
  evidence_ids: string[];
  cv_usage: string;
  cv_bullets: string[];
  claim_boundaries: string[];
  allowed_claims: string[];
  review_flags: string[];
  confidential: boolean;
};

export type CanonicalSkill = {
  skill_id: string;
  name: string;
  aliases: string[];
  category: string;
  strength: string;
  evidence_ids: string[];
  project_ids: string[];
  commercial_evidence: boolean | "unknown";
  note?: string;
};

export type CanonicalRoleTarget = {
  role_family_id: string;
  role_family: string;
  priority: "primary" | "secondary" | "adjacent";
  acceptable_titles: string[];
  avoid_titles: string[];
  supporting_skill_ids: string[];
  supporting_project_ids: string[];
  known_gaps?: string[];
  rationale?: string;
};

export type ClaimItem = { claim: string; reason?: string; basis?: string; project_ids?: string[] };

export type CanonicalProfile = {
  schema_version: string;
  candidate: {
    full_name: string;
    preferred_name?: string;
    location: { city: string; state: string; country: string; suburb?: string; timezone?: string };
    work_rights: { status: string; requires_sponsorship: boolean; restrictions?: string[] };
    professional_summary?: string;
    contact?: { email?: string; phone?: string };
    links?: { linkedin?: string; github?: string; portfolio?: string };
  };
  career_objectives: {
    primary_objective: string;
    motivations: string[];
    work_type_sought: string[];
    deliberate_differentiators: string[];
  };
  role_targets: CanonicalRoleTarget[];
  constraints: {
    work_rights: { country?: string; status?: string; sponsorship_required?: boolean };
    locations: {
      base?: string;
      preferred?: string[];
      acceptable?: string[];
      unacceptable?: string[];
    };
    work_modes: { preferred?: string[]; acceptable?: string[]; unacceptable?: string[] };
    compensation: {
      currency: string;
      floor_known: boolean;
      annual_floor: number | null;
      observed_target_range?: string | null;
      note?: string;
    };
    seniority: { target_levels?: string[]; excluded_levels?: string[]; note?: string };
    employment_basis?: { acceptable?: string[]; note?: string };
    hard_blockers: Array<{ blocker: string; reason: string }>;
    soft_preferences: Array<{ preference: string; direction: "prefer" | "avoid"; weight_hint?: string }>;
  };
  skills: CanonicalSkill[];
  experience: Array<{
    experience_id: string;
    organisation: string;
    engagement_type: string;
    role_title: string;
    project_ids?: string[];
    evidence_ids?: string[];
  }>;
  projects: CanonicalProject[];
  education: Array<{ qualification: string; provider: string; status?: string }>;
  certifications: Array<{
    name: string;
    provider: string;
    achievement_status: "completed" | "in_progress" | "unknown";
    current_validity: "valid" | "expired" | "not_applicable" | "unverified";
    review_flags?: string[];
  }>;
  evidence: CanonicalEvidence[];
  claim_policy: {
    principles: string[];
    supported_claims: ClaimItem[];
    qualified_claims: Array<{ claim: string; required_qualification: string; project_ids?: string[] }>;
    forbidden_claims: ClaimItem[];
    not_currently_evidenced: ClaimItem[];
    boundaries: Array<{ boundary: string; rule: string }>;
    uncertain_facts: Array<{ item: string; why_uncertain: string; resolution_required: string }>;
  };
  preferences: Record<string, unknown>;
  provenance: Record<string, unknown>;
};

export type DiscoveryTarget = {
  role_family_id: string;
  role_family: string;
  priority: string;
  enabled_for_discovery: boolean;
  rationale?: string;
};

export type DecisionPolicy = {
  policy_version: string;
  derived_from?: string;
  active_discovery_targets: DiscoveryTarget[];
  hard_constraints: {
    blockers: Array<{ blocker: string; reason: string }>;
    years_in_title_rule?: { default_route: string; hard_reject_only_when: string; note: string };
  };
  triage_policy: {
    buckets: string[];
    reject_on: string[];
    never_auto_reject_on: string[];
    route_to: Record<string, string>;
    do_not_send_every_non_blocked_job_to_deep_review?: boolean;
  };
  compensation_policy: {
    minimum_acceptable_compensation: number | null;
    floor_known: boolean;
    currency: string;
    routing_rule: string;
  };
  application_strategy: {
    requirement_match_guidance: {
      heuristic: string;
      never_an_automatic_rejection_threshold: boolean;
    };
  };
  claim_use_policy: Record<string, unknown>;
};

export type JobRequirement = {
  id: string;
  text: string;
  category: string;
  importance: "MUST" | "SHOULD" | "NICE";
  sourceSpan: string | null;
  extractionConfidence: number;
};

export type EvidenceMatch = {
  requirementId: string;
  evidenceIds: string[];
  projectIds: string[];
  support: "SUPPORTED" | "PARTIAL" | "UNSUPPORTED" | "UNKNOWN";
  confidence: number;
};

export type IntegrityResult = { ok: true } | { ok: false; errors: string[] };
