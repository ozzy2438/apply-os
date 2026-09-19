import { DIMENSIONS, type ResumeContext, type ResumeDraft, type ResumePolicy } from "./types";
import { claimHash } from "./identity";
export class InputError extends Error { constructor(public readonly code: string) { super(code); this.name = "InputError"; } }
export function ensure(test: unknown, code: string): asserts test { if (!test) throw new InputError(code); }
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }
export function str(v: unknown): v is string { return typeof v === "string" && v.trim().length > 0; }
export function ids(v: unknown): v is string[] { return Array.isArray(v) && v.every(str); }
export function unique(xs: readonly string[]): boolean { return new Set(xs).size === xs.length; }
export function assertPolicy(p: ResumePolicy): void {
  ensure(object(p), "INVALID_POLICY");
  ensure(str(p.version), "INVALID_POLICY_VERSION");
  for (const k of ["maxEntries", "maxBulletsPerEntry", "maxSummaryClaims", "maxSkills", "maxCredentialClaims", "maxWords", "timeoutMs", "maxModelInputChars"] as const) {
    ensure(Number.isInteger(p[k]) && p[k] > 0, `INVALID_POLICY_${k}`);
  }
  ensure(p.maxEntries <= 4 && p.maxBulletsPerEntry <= 4 && p.maxSummaryClaims <= 3 && p.maxSkills <= 8, "POLICY_FORMAT_LIMIT");
  ensure(p.maxRevisions === 0 || p.maxRevisions === 1, "UNBOUNDED_REVISION_POLICY");
  for (const k of ["confidenceFloor", "readyScore", "revisionScore"] as const)
    ensure(Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 1, `INVALID_POLICY_${k}`);
  ensure(p.readyScore >= p.revisionScore, "REVERSED_SCORE_THRESHOLDS");
  ensure(p.expectedPages === 1 && Number.isFinite(p.minFontSizePt) && p.minFontSizePt >= 10, "INVALID_LAYOUT_POLICY");
  ensure(object(p.weights) && Object.keys(p.weights).length === DIMENSIONS.length, "INVALID_WEIGHT_KEYS");
  ensure(DIMENSIONS.every(d => Number.isFinite(p.weights[d]) && p.weights[d] >= 0), "INVALID_WEIGHTS");
  ensure(Math.abs(DIMENSIONS.reduce((s, d) => s + p.weights[d], 0) - 1) < 1e-9, "WEIGHTS_MUST_SUM_TO_ONE");
  ensure(ids(p.notApplicableDimensions) && unique(p.notApplicableDimensions) &&
    p.notApplicableDimensions.every(d => DIMENSIONS.includes(d)), "INVALID_NA_DIMENSIONS");
  ensure(DIMENSIONS.filter(d => !p.notApplicableDimensions.includes(d)).some(d => p.weights[d] > 0), "NO_ACTIVE_WEIGHTS");
}
/** Strict model output parser. Unknown fields are rejected, not silently stripped. */
export function parseDraft(v: unknown): ResumeDraft {
  ensure(object(v), "DRAFT_NOT_OBJECT");
  const fields = ["planId", "summaryClaimIds", "skillClaimIds", "entries", "educationClaimIds", "certificationClaimIds"];
  ensure(Object.keys(v).length === fields.length && Object.keys(v).every(k => fields.includes(k)), "INVALID_DRAFT_FIELDS");
  ensure(str(v.planId), "INVALID_PLAN_ID");
  for (const k of fields.filter(k => k.endsWith("ClaimIds"))) ensure(ids(v[k]), `INVALID_DRAFT_${k}`);
  ensure(Array.isArray(v.entries), "INVALID_ENTRIES");
  for (const e of v.entries) {
    ensure(object(e) && Object.keys(e).length === 2 && str(e.subjectId) && ids(e.claimIds) && e.claimIds.length > 0, "INVALID_ENTRY");
    ensure(Object.keys(e).every(k => ["subjectId", "claimIds"].includes(k)), "INVALID_ENTRY_FIELDS");
  }
  return structuredClone(v) as unknown as ResumeDraft;
}
/** Host MUST additionally validate its full canonical profile against its own schema. */
export function assertContext(ctx: ResumeContext): void {
  ensure(object(ctx) && object(ctx.scope) && object(ctx.header) && object(ctx.job), "INVALID_CONTEXT");
  for (const [key, value] of Object.entries(ctx.scope)) ensure(str(value), `INVALID_SCOPE_${key}`);
  for (const key of ["tenantId", "candidateId", "jobId", "profileVersion", "decisionPolicyVersion"] as const) ensure(str(ctx.scope[key]), `MISSING_SCOPE_${key}`);
  for (const key of ["profileHash", "decisionPolicyHash", "jobHash"] as const) ensure(/^[a-f0-9]{64}$/.test(ctx.scope[key]), `INVALID_HASH_${key}`);
  ensure(str(ctx.header.fullName) && str(ctx.header.location), "INVALID_HEADER");
  ensure(Array.isArray(ctx.header.links) && ctx.header.links.every(x => object(x) && str(x.label) && str(x.url)), "INVALID_HEADER_LINKS");
  ensure([ctx.header.email, ctx.header.phone].every(x => x === null || str(x)), "INVALID_CONTACT");
  ensure(str(ctx.job.title) && str(ctx.job.organisation) && str(ctx.job.roleFamilyId) && str(ctx.job.advertisement), "INVALID_JOB");
  for (const k of ["entities", "evidence", "claims", "matches"] as const) ensure(Array.isArray(ctx[k]), `INVALID_${k}`);
  ensure(Array.isArray(ctx.job.requirements), "INVALID_REQUIREMENTS");
  const kinds = ["project", "experience", "education", "certification", "candidate_fact"];
  const validRef = (s: unknown): s is { type: string; id: string } => object(s) && str(s.id) && typeof s.type === "string" && kinds.includes(s.type);
  ensure(ctx.entities.every(e => object(e) && validRef(e.subject)), "INVALID_ENTITY_SUBJECT");
  // IDs must be globally unambiguous inside this projection. Preserve canonical IDs.
  ensure(unique(ctx.entities.map(e => e.subject.id)), "DUPLICATE_ENTITY_ID");
  const entities = new Map(ctx.entities.map(e => [e.subject.id, e]));
  for (const e of ctx.entities) {
    ensure(str(e.title) && (e.organisation === null || str(e.organisation)) && (e.period === null || str(e.period)), "INVALID_ENTITY_METADATA");
    ensure(typeof e.metadataApproved === "boolean" && ids(e.boundaries), "INVALID_ENTITY_APPROVAL");
    ensure(e.exclusiveGroup === null || str(e.exclusiveGroup), "INVALID_EXCLUSIVE_GROUP");
    ensure(e.engagement === null || ["contract", "freelance", "independent", "portfolio", "employment", "unknown"].includes(e.engagement), "INVALID_ENGAGEMENT");
    ensure(["preferred", "standard", "supporting", "restricted", "excluded"].includes(e.cvUsage), "INVALID_CV_USAGE");
  }
  const resolves = (s: {type: string; id: string}) => entities.get(s.id)?.subject.type === s.type;
  ensure(ctx.evidence.every(e => object(e) && str(e.id) && validRef(e.subject) && resolves(e.subject) && str(e.sourceText) && str(e.sourceDocument) &&
    (e.sourceLocator === null || str(e.sourceLocator)) && ["verified", "documented", "self_reported", "uncertain"].includes(e.strength)), "INVALID_EVIDENCE");
  ensure(unique(ctx.evidence.map(e => e.id)), "DUPLICATE_EVIDENCE_ID");
  const evidence = new Map(ctx.evidence.map(e => [e.id, e]));
  ensure(ctx.claims.every(c => object(c) && str(c.id)), "INVALID_CLAIM");
  ensure(unique(ctx.claims.map(c => c.id)), "DUPLICATE_CLAIM_ID");
  const claimIds = new Set(ctx.claims.map(c => c.id));
  for (const c of ctx.claims) {
    ensure(validRef(c.subject) && resolves(c.subject) && str(c.text) && ids(c.evidenceIds) && unique(c.evidenceIds) && c.evidenceIds.length > 0 && ids(c.requiredQualifiers), "INVALID_CLAIM_CONTENT");
    ensure(c.evidenceIds.every(id => evidence.has(id)), "BROKEN_CLAIM_EVIDENCE_REF");
    ensure(c.evidenceIds.every(id => evidence.get(id)?.subject.id === c.subject.id), "WRONG_SUBJECT_EVIDENCE");
    ensure(["summary", "skill", "bullet", "education", "certification"].includes(c.kind), "INVALID_CLAIM_KIND");
    ensure(["client_production", "client_delivery", "held_out_evaluation", "controlled_validation", "backtest_or_simulation", "synthetic_data", "public_data_analysis", "modelled_scenario", "unstated", "not_applicable"].includes(c.measurementContext), "INVALID_MEASUREMENT_CONTEXT");
    ensure(object(c.approval) && ["approved", "pending", "blocked"].includes(c.approval.status) &&
      ["human", "validated_claim_guard", "none"].includes(c.approval.method) && str(c.approval.profileHash), "INVALID_CLAIM_APPROVAL");
    ensure(c.approval.contentHash === null || /^[a-f0-9]{64}$/.test(c.approval.contentHash), "INVALID_CLAIM_HASH");
    if (c.approval.status === "approved") {
      ensure(c.approval.method !== "none" && c.approval.contentHash === claimHash(c) && c.approval.profileHash === ctx.scope.profileHash, "STALE_OR_INVALID_CLAIM_APPROVAL");
      ensure(c.evidenceIds.every(id => evidence.get(id)?.strength !== "uncertain"), "UNCERTAIN_EVIDENCE_CANNOT_AUTO_SUPPORT_APPROVED_CLAIM");
    }
  }
  ensure(ctx.job.requirements.every(r => object(r) && str(r.id) && str(r.text) && str(r.sourceQuote) &&
    ["MUST", "SHOULD", "NICE", "UNKNOWN"].includes(r.importance)), "INVALID_REQUIREMENT");
  ensure(unique(ctx.job.requirements.map(r => r.id)), "DUPLICATE_REQUIREMENT_ID");
  for (const r of ctx.job.requirements) ensure(ctx.job.advertisement.includes(r.sourceQuote), "REQUIREMENT_QUOTE_NOT_IN_JOB");
  const reqIds = new Set(ctx.job.requirements.map(r => r.id));
  ensure(unique(ctx.matches.map(m => m.requirementId)), "DUPLICATE_REQUIREMENT_MATCH");
  for (const m of ctx.matches) ensure(object(m) && reqIds.has(m.requirementId) && ids(m.claimIds) && unique(m.claimIds) && m.claimIds.every(id => claimIds.has(id)) &&
    ["SUPPORTED", "PARTIAL", "UNSUPPORTED", "UNKNOWN"].includes(m.support), "INVALID_REQUIREMENT_MATCH");
}
