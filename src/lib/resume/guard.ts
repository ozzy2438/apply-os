import type { ClaimCard, GuardResult, ResumeContext, ResumeDraft, ResumePlan, ResumePolicy, RewriteProposal } from "./types";
import { assertContext, assertPolicy, parseDraft, unique } from "./validation";
import { contextHash, draftHash, hash } from "./identity";
export function selectedClaimIds(d: ResumeDraft): string[] {
  return [...d.summaryClaimIds, ...d.skillClaimIds, ...d.entries.flatMap(e => e.claimIds), ...d.educationClaimIds, ...d.certificationClaimIds];
}
/** A reference/quote match alone does not prove support. This gate accepts only reviewed claim cards. */
export function guardDraft(ctx: ResumeContext, plan: ResumePlan, input: unknown, p: ResumePolicy): GuardResult {
  assertContext(ctx); assertPolicy(p);
  const d = parseDraft(input);
  const errors: string[] = [], warnings = [...plan.warnings];
  const { id, ...planBody } = plan;
  if (id !== hash(planBody) || plan.contextHash !== contextHash(ctx) || plan.policyHash !== hash(p) || d.planId !== id) errors.push("STALE_OR_CHANGED_PLAN");
  const all = selectedClaimIds(d), allowed = new Set(plan.allowedClaimIds);
  if (!unique(all) || !unique(d.entries.map(e => e.subjectId))) errors.push("DUPLICATE_DRAFT_CONTENT");
  if (!d.entries.length) errors.push("NO_WORK_EVIDENCE_SELECTED");
  if (d.entries.length > p.maxEntries || d.entries.some(e => e.claimIds.length > p.maxBulletsPerEntry) ||
    d.summaryClaimIds.length > p.maxSummaryClaims || d.skillClaimIds.length > p.maxSkills ||
    d.educationClaimIds.length + d.certificationClaimIds.length > p.maxCredentialClaims) errors.push("FORMAT_LIMIT_EXCEEDED");
  const claims = new Map(ctx.claims.map(c => [c.id,c]));
  const entities = new Map(ctx.entities.map(e => [e.subject.id,e]));
  const checkKind = (xs: string[], kind: ClaimCard["kind"]) => {
    for (const id of xs) if (claims.get(id)?.kind !== kind) errors.push(`WRONG_CLAIM_KIND:${id}`);
  };
  checkKind(d.summaryClaimIds,"summary"); checkKind(d.skillClaimIds,"skill");
  checkKind(d.educationClaimIds,"education"); checkKind(d.certificationClaimIds,"certification");
  const groups = new Set<string>();
  for (const entry of d.entries) {
    if (!plan.entryIds.includes(entry.subjectId)) errors.push(`ENTRY_NOT_IN_PLAN:${entry.subjectId}`);
    const entity = entities.get(entry.subjectId);
    if (entity?.exclusiveGroup) {
      if (groups.has(entity.exclusiveGroup)) errors.push("DUPLICATE_BODY_OF_WORK");
      groups.add(entity.exclusiveGroup);
    }
    for (const id of entry.claimIds) if (claims.get(id)?.subject.id !== entry.subjectId) errors.push(`WRONG_ENTRY_SUBJECT:${id}`);
    checkKind(entry.claimIds,"bullet");
    if (entity && (!entity.period || entity.engagement === "unknown")) warnings.push(`Period or engagement needs confirmation: ${entity.subject.id}`);
  }
  const selectedSubjects = new Set<string>();
  for (const id of all) {
    const c = claims.get(id);
    if (!c || !allowed.has(id)) { errors.push(`CLAIM_NOT_IN_PLAN:${id}`); continue; }
    selectedSubjects.add(c.subject.id);
    const entity = entities.get(c.subject.id);
    if (entity && ["independent","portfolio"].includes(entity.engagement ?? "") && ["client_production","client_delivery"].includes(c.measurementContext)) errors.push(`ENGAGEMENT_CONTEXT_CONTRADICTION:${id}`);
    if (c.approval.status !== "approved") errors.push(`CLAIM_NOT_APPROVED:${id}`);
    if (entities.get(c.subject.id)?.cvUsage === "excluded") errors.push(`EXCLUDED_SOURCE:${c.subject.id}`);
    if (!c.requiredQualifiers.every(q => c.text.includes(q))) errors.push(`MISSING_QUALIFIER:${id}`);
    // Numerical claims in non-live settings need explicit, reviewed qualifiers.
    if (/\d/.test(c.text) && ["held_out_evaluation","controlled_validation","backtest_or_simulation","synthetic_data","modelled_scenario"].includes(c.measurementContext) && !c.requiredQualifiers.length)
      errors.push(`QUALIFIER_REQUIRED:${id}`);
  }
  for (const id of selectedSubjects) if (!entities.get(id)?.metadataApproved) warnings.push(`Unapproved public metadata: ${id}`);
  const text = all.map(id => claims.get(id)?.text ?? "").join(" ");
  if (text.trim().split(/\s+/).length > p.maxWords) errors.push("TEXT_WORD_BUDGET_EXCEEDED");
  for (const r of ctx.job.requirements.filter(r => r.importance === "MUST")) {
    const m = ctx.matches.find(m => m.requirementId === r.id);
    if (!m || m.support !== "SUPPORTED" || !m.claimIds.some(id => all.includes(id))) warnings.push(`Must-have not fully presented: ${r.id}`);
  }
  return { passed:errors.length===0, errors:[...new Set(errors)], warnings:[...new Set(warnings)], draftHash:draftHash(ctx,d,p) };
}
/** Human edits/LLM paraphrases enter PENDING. They do not mutate facts or auto-approve themselves. */
export function proposeRewrite(ctx: ResumeContext, proposal: RewriteProposal): ClaimCard {
  assertContext(ctx);
  const source = ctx.claims.find(c => c.id===proposal.originalClaimId);
  if (!source || typeof proposal.text !== "string" || !proposal.text.trim() || !Array.isArray(proposal.evidenceIds) ||
    !proposal.evidenceIds.length || !proposal.evidenceIds.every(id=>source.evidenceIds.includes(id))) throw new Error("INVALID_REWRITE_PROPOSAL");
  return {...structuredClone(source), id:`proposal-${hash(proposal).slice(0,16)}`, text:proposal.text,
    evidenceIds:[...proposal.evidenceIds], approval:{status:"pending",method:"none",profileHash:ctx.scope.profileHash,contentHash:null}};
}
