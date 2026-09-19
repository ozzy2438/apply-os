import { qualifierForClaim, scanClaimSafety, isApplicationExcludedProject } from "@/lib/canonical/claims";
import type { CanonicalProfile, CanonicalProject } from "@/lib/canonical/types";
import type { ClaimCard, EngagementType, Evidence, SourceEntity, SubjectKind } from "./types";
import { claimHash } from "./identity";

/** Only documented same-work / phase collisions. Every related_project edge is not a duplicate. */
const EXCLUSIVE_GROUPS: Record<string, string> = {
  P04: "same-work-p04-p14",
  P14: "same-work-p04-p14",
  P58: "same-work-p58-p59",
  P59: "same-work-p58-p59",
  P31: "phase-rg271-p31-p33",
  P33: "phase-rg271-p31-p33",
};

const ENGAGEMENTS = new Set<EngagementType>([
  "contract",
  "freelance",
  "independent",
  "portfolio",
  "employment",
  "unknown",
]);

function extra<T>(row: object, key: string): T | undefined {
  return (row as Record<string, unknown>)[key] as T | undefined;
}

function asEngagement(value: string | null | undefined): EngagementType | null {
  if (!value) return null;
  return ENGAGEMENTS.has(value as EngagementType) ? (value as EngagementType) : "unknown";
}

function asUsage(value: string | undefined): SourceEntity["cvUsage"] {
  if (value === "preferred" || value === "standard" || value === "supporting" || value === "restricted" || value === "excluded") {
    return value;
  }
  return "supporting";
}

function period(start?: string | null, end?: string | null): string | null {
  if (!start && !end) return null;
  return `${start ?? "start unconfirmed"} – ${end ?? "present"}`;
}

function mapStrength(value: string): Evidence["strength"] {
  if (value === "verified" || value === "documented" || value === "self_reported" || value === "uncertain") return value;
  return "self_reported";
}

function inferMeasurement(text: string, engagement: EngagementType | null): ClaimCard["measurementContext"] {
  const t = text.toLowerCase();
  if (/\bsynthetic\b/.test(t)) return "synthetic_data";
  if (/\bheld-?out\b/.test(t)) return "held_out_evaluation";
  if (/\bcontrolled (benchmark|validation|test)\b/.test(t)) return "controlled_validation";
  if (/\bbacktest|walk-forward|walk forward\b/.test(t)) return "backtest_or_simulation";
  if (/\bsimulat|modelled|modeled\b/.test(t)) return "modelled_scenario";
  if (/\bpublic (data|dataset)\b|fda|aihw|abs seifa|aemo|austender/.test(t)) return "public_data_analysis";
  if (engagement === "contract" || engagement === "freelance") return "client_delivery";
  if (engagement === "independent" || engagement === "portfolio") return "unstated";
  return "unstated";
}

function overlap(a: string, b: string): number {
  const left = new Set(a.toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 3));
  let n = 0;
  for (const w of left) if (b.toLowerCase().includes(w)) n += 1;
  return n;
}

function qualifiersFor(text: string, profile: CanonicalProfile, measurement: ClaimCard["measurementContext"]): string[] {
  const out: string[] = [];
  const policy = qualifierForClaim(text, profile);
  if (policy && text.toLowerCase().includes(policy.toLowerCase().slice(0, 12))) out.push(policy);
  const hints: Array<[RegExp, string]> = [
    [/in a controlled benchmark/i, "in a controlled benchmark"],
    [/modelled|modeled/i, "modelled"],
    [/simulat/i, "simulated"],
    [/public data/i, "public data"],
    [/synthetic/i, "synthetic"],
    [/held-?out/i, "held-out"],
    [/walk-forward/i, "walk-forward"],
  ];
  for (const [re, q] of hints) if (re.test(text) && !out.includes(q)) out.push(q);
  if (
    /\d/.test(text) &&
    ["held_out_evaluation", "controlled_validation", "backtest_or_simulation", "synthetic_data", "modelled_scenario"].includes(
      measurement,
    ) &&
    !out.length
  ) {
    // Do not invent a qualifier. Leave pending so the guard cannot auto-approve a bare number.
  }
  return out;
}

export type ClaimBank = {
  entities: SourceEntity[];
  evidence: Evidence[];
  claims: ClaimCard[];
  pendingReview: Array<{ id: string; reason: string }>;
};

export function buildClaimBank(profile: CanonicalProfile, profileHash: string): ClaimBank {
  const entities: SourceEntity[] = [];
  const evidence: Evidence[] = [];
  const claims: ClaimCard[] = [];
  const pendingReview: Array<{ id: string; reason: string }> = [];
  const entityIds = new Set<string>();

  const addEntity = (entity: SourceEntity) => {
    if (entityIds.has(entity.subject.id)) return;
    entityIds.add(entity.subject.id);
    entities.push(entity);
  };

  addEntity({
    subject: { type: "candidate_fact", id: "years_experience" },
    title: "Professional identity",
    organisation: null,
    period: extra<string>(extra<object>(profile.candidate, "years_experience") ?? {}, "independent_delivery_since")
      ? `${extra<string>(extra<object>(profile.candidate, "years_experience") ?? {}, "independent_delivery_since")} – present`
      : null,
    engagement: null,
    cvUsage: "standard",
    metadataApproved: true,
    exclusiveGroup: null,
    boundaries: ["Contact details stay off the model path."],
  });

  for (const exp of profile.experience) {
    const start = extra<string>(exp, "start_date") ?? null;
    const end = extra<string>(exp, "end_date") ?? null;
    const engagement = asEngagement(exp.engagement_type);
    addEntity({
      subject: { type: "experience", id: exp.experience_id },
      title: exp.role_title,
      organisation: exp.organisation,
      period: period(start, end),
      engagement,
      cvUsage: "standard",
      metadataApproved: Boolean(start && engagement && engagement !== "unknown"),
      exclusiveGroup: null,
      boundaries: extra<string>(exp, "note") ? [String(extra<string>(exp, "note"))] : [],
    });
  }

  for (const project of profile.projects) {
    addEntity(projectEntity(project));
  }

  profile.education.forEach((edu, i) => {
    const verified = extra<boolean>(edu, "qualification_title_verified") === true;
    addEntity({
      subject: { type: "education", id: edu.qualification },
      title: edu.qualification,
      organisation: edu.provider,
      period: period(extra<string>(edu, "start_date") ?? null, extra<string>(edu, "end_date") ?? null),
      engagement: null,
      cvUsage: "standard",
      metadataApproved: verified,
      exclusiveGroup: null,
      boundaries: extra<string[]>(edu, "review_flags") ?? [],
    });
    const eid = `EV-EDU-${i}`;
    evidence.push({
      id: eid,
      subject: { type: "education", id: edu.qualification },
      sourceText: `${edu.qualification} — ${edu.provider}${edu.status ? `, ${edu.status}` : ""}`,
      sourceDocument: "candidate-profile.json",
      sourceLocator: `education[${i}]`,
      strength: verified ? "documented" : "uncertain",
    });
    pushClaim({
      id: `CL-EDU-${i}`,
      subject: { type: "education", id: edu.qualification },
      kind: "education",
      text: `${edu.qualification} — ${edu.provider}${edu.status ? `, ${edu.status}` : ""}.`,
      evidenceIds: [eid],
      requiredQualifiers: verified ? [] : [],
      measurementContext: "not_applicable",
      profile,
      profileHash,
      claims,
      pendingReview,
      evidence,
    });
  });

  profile.certifications.forEach((cert, i) => {
    const validity = cert.current_validity;
    const qualifier = validity === "unverified" ? "current validity unverified" : validity === "expired" ? "expired" : null;
    const text = `${cert.name} — ${cert.provider}, ${cert.achievement_status}${qualifier ? ` (${qualifier})` : ""}.`;
    addEntity({
      subject: { type: "certification", id: cert.name },
      title: cert.name,
      organisation: cert.provider,
      period: null,
      engagement: null,
      cvUsage: "standard",
      metadataApproved: validity === "valid" || validity === "not_applicable",
      exclusiveGroup: null,
      boundaries: cert.review_flags ?? [],
    });
    const eid = `EV-CERT-${i}`;
    evidence.push({
      id: eid,
      subject: { type: "certification", id: cert.name },
      sourceText: text,
      sourceDocument: "candidate-profile.json",
      sourceLocator: `certifications[${i}]`,
      strength: "self_reported",
    });
    pushClaim({
      id: `CL-CERT-${i}`,
      subject: { type: "certification", id: cert.name },
      kind: "certification",
      text,
      evidenceIds: [eid],
      requiredQualifiers: qualifier ? [qualifier] : [],
      measurementContext: "not_applicable",
      profile,
      profileHash,
      claims,
      pendingReview,
      evidence,
    });
  });

  for (const ev of profile.evidence) {
    if (ev.subject.type === "project" && isApplicationExcludedProject(ev.subject.id)) continue;
    evidence.push({
      id: ev.evidence_id,
      subject: ev.subject,
      sourceText: ev.source_text,
      sourceDocument: ev.source_document,
      sourceLocator: ev.source_locator ?? null,
      strength: mapStrength(ev.evidence_strength),
    });
  }

  if (profile.candidate.professional_summary) {
    evidence.push({
      id: "EV-FACT-SUMMARY",
      subject: { type: "candidate_fact", id: "years_experience" },
      sourceText: profile.candidate.professional_summary,
      sourceDocument: "candidate-profile.json",
      sourceLocator: "candidate.professional_summary",
      strength: "self_reported",
    });
    pushClaim({
      id: "CL-SUMMARY",
      subject: { type: "candidate_fact", id: "years_experience" },
      kind: "summary",
      text: profile.candidate.professional_summary,
      evidenceIds: ["EV-FACT-SUMMARY"],
      requiredQualifiers: [],
      measurementContext: "not_applicable",
      profile,
      profileHash,
      claims,
      pendingReview,
      evidence,
    });
  }

  for (const project of profile.projects) {
    if (isApplicationExcludedProject(project.project_id) || project.cv_usage === "excluded") continue;
    const projectEvidence = evidence.filter((e) => e.subject.id === project.project_id);
    project.cv_bullets.forEach((bullet, i) => {
      const evidenceIds = selectEvidenceIds(bullet, projectEvidence);
      if (!evidenceIds.length) {
        pendingReview.push({ id: `CL-${project.project_id}-B${i}`, reason: "Bullet has no overlapping registry evidence; not auto-approved." });
        return;
      }
      const measurement = inferMeasurement(bullet, asEngagement(project.engagement_type));
      pushClaim({
        id: `CL-${project.project_id}-B${i}`,
        subject: { type: "project", id: project.project_id },
        kind: "bullet",
        text: bullet,
        evidenceIds,
        requiredQualifiers: qualifiersFor(bullet, profile, measurement),
        measurementContext: measurement,
        profile,
        profileHash,
        claims,
        pendingReview,
        evidence,
      });
    });
  }

  for (const skill of profile.skills) {
    if (skill.strength === "uncertain" || !skill.evidence_ids.length) continue;
    if (/must not appear/i.test(skill.note ?? "")) continue;
    const usable = skill.evidence_ids
      .map((id) => evidence.find((row) => row.id === id))
      .filter((row): row is Evidence => row !== undefined && row.subject.type === "project" && !isApplicationExcludedProject(row.subject.id));
    const subjectId = usable[0]?.subject.id;
    if (!subjectId) continue;
    const evidenceIds = usable.filter((e) => e.subject.id === subjectId).map((e) => e.id);
    if (!evidenceIds.length) continue;
    pushClaim({
      id: `CL-${skill.skill_id}`,
      subject: { type: "project", id: subjectId },
      kind: "skill",
      text: skill.name,
      evidenceIds: evidenceIds.slice(0, 3),
      requiredQualifiers: [],
      measurementContext: "not_applicable",
      profile,
      profileHash,
      claims,
      pendingReview,
      evidence,
    });
  }

  return { entities, evidence, claims, pendingReview };
}

function projectEntity(project: CanonicalProject): SourceEntity {
  const engagement = asEngagement(project.engagement_type);
  const datesKnown = Boolean(project.start_date) && project.date_certainty !== "not_stated";
  return {
    subject: { type: "project", id: project.project_id },
    title: project.name,
    organisation: project.confidential ? sectorLabel(project) : organisationHint(project),
    period: period(project.start_date, project.end_date),
    engagement,
    cvUsage: isApplicationExcludedProject(project.project_id) ? "excluded" : asUsage(project.cv_usage),
    metadataApproved: Boolean(datesKnown && engagement && engagement !== "unknown"),
    exclusiveGroup: EXCLUSIVE_GROUPS[project.project_id] ?? null,
    boundaries: project.claim_boundaries,
  };
}

function sectorLabel(project: CanonicalProject): string {
  return project.domains[0] ? `Confidential client — ${project.domains[0]}` : "Confidential client";
}

function organisationHint(project: CanonicalProject): string | null {
  const client = extra<string>(project, "client_or_context");
  if (!client) return null;
  if (/not named|unnamed|nda|confidential/i.test(client)) return sectorLabel(project);
  return client.slice(0, 80);
}

function selectEvidenceIds(bullet: string, projectEvidence: Evidence[]): string[] {
  const scored = projectEvidence
    .map((ev) => ({ ev, n: overlap(bullet, `${ev.sourceText}`) }))
    .filter((row) => row.n >= 1)
    .sort((a, b) => b.n - a.n);
  return scored.slice(0, 3).map((row) => row.ev.id);
}

function pushClaim(input: {
  id: string;
  subject: { type: SubjectKind; id: string };
  kind: ClaimCard["kind"];
  text: string;
  evidenceIds: string[];
  requiredQualifiers: string[];
  measurementContext: ClaimCard["measurementContext"];
  profile: CanonicalProfile;
  profileHash: string;
  claims: ClaimCard[];
  pendingReview: Array<{ id: string; reason: string }>;
  evidence: Evidence[];
}): void {
  const blockers = scanClaimSafety(input.text, input.profile);
  const cited = input.evidenceIds.filter((id) => input.evidence.some((e) => e.id === id));
  const usable = cited
    .map((id) => input.evidence.find((e) => e.id === id))
    .filter((row): row is Evidence => row !== undefined && row.strength !== "uncertain");
  const missingQualifiers = input.requiredQualifiers.filter((q) => !input.text.includes(q));
  if (!cited.length) {
    input.pendingReview.push({ id: input.id, reason: "No overlapping registry evidence." });
    return;
  }
  const card: ClaimCard = {
    id: input.id,
    subject: input.subject,
    kind: input.kind,
    text: input.text,
    evidenceIds: cited,
    requiredQualifiers: input.requiredQualifiers,
    measurementContext: input.measurementContext,
    approval: {
      status: "pending",
      method: "none",
      profileHash: input.profileHash,
      contentHash: null,
    },
  };

  if (blockers.length) {
    card.approval.status = "blocked";
    input.pendingReview.push({ id: input.id, reason: blockers[0] ?? "Claim guard blocked this wording." });
    input.claims.push(card);
    return;
  }
  if (!usable.length || missingQualifiers.length) {
    input.pendingReview.push({
      id: input.id,
      reason: !usable.length
        ? "Uncertain evidence cannot auto-support an approved claim."
        : "Required qualifier is not present in the source wording.",
    });
    input.claims.push(card);
    return;
  }

  card.evidenceIds = usable.map((e) => e.id);
  card.approval.status = "approved";
  card.approval.method = "validated_claim_guard";
  card.approval.contentHash = claimHash(card);
  input.claims.push(card);
}

export function claimsForEvidenceIds(claims: ClaimCard[], evidenceIds: string[]): string[] {
  const wanted = new Set(evidenceIds);
  return claims.filter((c) => c.evidenceIds.some((id) => wanted.has(id))).map((c) => c.id);
}
