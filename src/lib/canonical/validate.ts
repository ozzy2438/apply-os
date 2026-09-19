import { deriveCommercialEvidence } from "./commercial";
import {
  CANONICAL_SCHEMA_VERSION,
  EVIDENCE_SUBJECT_TYPES,
  type CanonicalProfile,
  type IntegrityResult,
} from "./types";

const TOP_REQUIRED = [
  "schema_version",
  "candidate",
  "career_objectives",
  "role_targets",
  "constraints",
  "skills",
  "experience",
  "projects",
  "education",
  "certifications",
  "evidence",
  "claim_policy",
  "preferences",
  "provenance",
] as const;

const CANDIDATE_FACTS = new Set([
  "work_rights",
  "location",
  "compensation",
  "years_experience",
  "contact",
]);

function unique(ids: string[], label: string, errors: string[]) {
  if (new Set(ids).size !== ids.length) errors.push(`Duplicate ${label}`);
}

function schemaShape(profile: CanonicalProfile, errors: string[]) {
  if (profile.schema_version !== CANONICAL_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${CANONICAL_SCHEMA_VERSION}`);
  }
  for (const key of TOP_REQUIRED) {
    if (!(key in profile)) errors.push(`Missing required field ${key}`);
  }
  const cp = profile.claim_policy;
  if (!cp?.forbidden_claims || !cp.not_currently_evidenced || !cp.qualified_claims) {
    errors.push("claim_policy must include forbidden_claims, not_currently_evidenced, and qualified_claims");
  }
  for (const ev of profile.evidence ?? []) {
    if (!ev.subject || !EVIDENCE_SUBJECT_TYPES.includes(ev.subject.type) || !ev.subject.id) {
      errors.push(`Evidence ${ev.evidence_id} is missing a valid subject`);
    }
    if ("project_id" in ev) errors.push(`Evidence ${ev.evidence_id} still uses project_id`);
  }
  for (const cert of profile.certifications ?? []) {
    if (!cert.achievement_status || !cert.current_validity) {
      errors.push(`Certification ${cert.name} must split achievement_status from current_validity`);
    }
  }
  for (const rt of profile.role_targets ?? []) {
    if (!rt.role_family_id) errors.push(`Role family ${rt.role_family} is missing role_family_id`);
  }
}

function subjectResolves(profile: CanonicalProfile, type: string, id: string): boolean {
  if (type === "project") return profile.projects.some((p) => p.project_id === id);
  if (type === "experience") return profile.experience.some((e) => e.experience_id === id);
  if (type === "education") return profile.education.some((e) => e.qualification === id);
  if (type === "certification") return profile.certifications.some((c) => c.name === id);
  if (type === "candidate_fact") return CANDIDATE_FACTS.has(id);
  return false;
}

export function validateCandidateProfileIntegrity(profile: CanonicalProfile): IntegrityResult {
  const errors: string[] = [];
  schemaShape(profile, errors);

  if (profile.projects.length !== 64) errors.push(`Expected 64 projects, found ${profile.projects.length}`);
  unique(profile.projects.map((p) => p.project_id), "project IDs", errors);
  unique(profile.skills.map((s) => s.skill_id), "skill IDs", errors);
  unique(profile.evidence.map((e) => e.evidence_id), "evidence IDs", errors);

  const projectIds = new Set(profile.projects.map((p) => p.project_id));
  const skillIds = new Set(profile.skills.map((s) => s.skill_id));
  const evidenceIds = new Set(profile.evidence.map((e) => e.evidence_id));
  const roleFamilyIds = new Set(profile.role_targets.map((r) => r.role_family_id));

  for (const ev of profile.evidence) {
    if (!subjectResolves(profile, ev.subject.type, ev.subject.id)) {
      errors.push(`Evidence ${ev.evidence_id} subject ${ev.subject.type}:${ev.subject.id} does not resolve`);
    }
  }

  for (const proj of profile.projects) {
    for (const evId of proj.evidence_ids ?? []) {
      if (!evidenceIds.has(evId)) errors.push(`Project ${proj.project_id} references missing evidence ${evId}`);
    }
    for (const rel of proj.related_project_ids ?? []) {
      if (!projectIds.has(rel)) errors.push(`Project ${proj.project_id} related_project_id ${rel} does not resolve`);
    }
    const hasDate = Boolean(proj.start_date) || Boolean(proj.end_date);
    if (hasDate && proj.date_certainty !== "stated_in_source") {
      errors.push(`Project ${proj.project_id} has a stated date but date_certainty=${proj.date_certainty}`);
    }
    if (!hasDate && proj.date_certainty !== "not_stated") {
      errors.push(`Project ${proj.project_id} has no date but date_certainty=${proj.date_certainty}`);
    }
    for (const fid of proj.role_family_ids ?? []) {
      if (!roleFamilyIds.has(fid)) errors.push(`Project ${proj.project_id} role_family_id ${fid} does not resolve`);
    }
  }

  const projectsById = new Map(profile.projects.map((p) => [p.project_id, p]));
  for (const skill of profile.skills) {
    for (const evId of skill.evidence_ids) {
      if (!evidenceIds.has(evId)) errors.push(`Skill ${skill.skill_id} references missing evidence ${evId}`);
    }
    for (const pid of skill.project_ids) {
      if (!projectIds.has(pid)) errors.push(`Skill ${skill.skill_id} references missing project ${pid}`);
    }
    const types = skill.project_ids.map((id) => projectsById.get(id)?.engagement_type).filter(Boolean) as string[];
    const expected = deriveCommercialEvidence(types);
    if (skill.commercial_evidence !== expected) {
      errors.push(`Skill ${skill.skill_id} commercial_evidence=${String(skill.commercial_evidence)} expected ${String(expected)}`);
    }
    if (expected === false && skill.commercial_evidence === true) {
      errors.push(`Skill ${skill.skill_id} converts independent work into paid commercial evidence`);
    }
  }

  for (const rt of profile.role_targets) {
    for (const pid of rt.supporting_project_ids) {
      if (!projectIds.has(pid)) errors.push(`Role ${rt.role_family_id} references missing project ${pid}`);
    }
    for (const sid of rt.supporting_skill_ids) {
      if (!skillIds.has(sid)) errors.push(`Role ${rt.role_family_id} references missing skill ${sid}`);
    }
  }

  for (const exp of profile.experience) {
    for (const pid of exp.project_ids ?? []) {
      if (!projectIds.has(pid)) errors.push(`Experience ${exp.experience_id} references missing project ${pid}`);
    }
    for (const evId of exp.evidence_ids ?? []) {
      if (!evidenceIds.has(evId)) errors.push(`Experience ${exp.experience_id} references missing evidence ${evId}`);
    }
  }

  const referencedEvidence = new Set<string>();
  for (const proj of profile.projects) for (const id of proj.evidence_ids ?? []) referencedEvidence.add(id);
  for (const skill of profile.skills) for (const id of skill.evidence_ids) referencedEvidence.add(id);
  for (const exp of profile.experience) for (const id of exp.evidence_ids ?? []) referencedEvidence.add(id);
  for (const ev of profile.evidence) {
    if (ev.subject.type === "project" && !projectIds.has(ev.subject.id)) {
      errors.push(`Orphan evidence ${ev.evidence_id}`);
    }
  }

  const paidRelabel = profile.projects.filter(
    (p) =>
      (p.engagement_type === "independent" || p.engagement_type === "portfolio") &&
      /client engagement|paid client|commissioned by/i.test(p.cv_bullets.join(" ")),
  );
  if (paidRelabel.length) {
    errors.push(`Independent work presented as paid client work: ${paidRelabel.map((p) => p.project_id).join(", ")}`);
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

export function assertCandidateProfileIntegrity(profile: CanonicalProfile): void {
  const result = validateCandidateProfileIntegrity(profile);
  if (!result.ok) {
    throw new Error(`Canonical profile integrity failed:\n- ${result.errors.join("\n- ")}`);
  }
}
