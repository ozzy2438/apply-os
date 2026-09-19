import type { ClaimCard, ResumeContext, ResumePlan, ResumePolicy } from "./types";
import { assertContext, assertPolicy } from "./validation";
import { contextHash, hash } from "./identity";
export function usableClaims(ctx: ResumeContext): ClaimCard[] {
  return ctx.claims.filter(c => c.approval.status === "approved" && ctx.entities.some(e =>
    e.subject.id === c.subject.id && e.cvUsage !== "excluded"));
}
/** Greedy requirement coverage over the COMPLETE approved bank. Not a semantic fit model. */
export function makePlan(ctx: ResumeContext, policy: ResumePolicy): ResumePlan {
  assertContext(ctx); assertPolicy(policy);
  const eligible = usableClaims(ctx);
  const available = new Map(eligible.map(c => [c.id, c]));
  const reqWeights = new Map(ctx.job.requirements.map(r => [r.id,
    r.importance === "MUST" ? 3 : r.importance === "SHOULD" ? 2 : 1]));
  const benefit = (ids: Set<string>, uncovered: Set<string>): number => ctx.matches.reduce((s, m) => {
    if (!uncovered.has(m.requirementId) || !m.claimIds.some(id => ids.has(id))) return s;
    return s + (reqWeights.get(m.requirementId) ?? 1) * (m.support === "SUPPORTED" ? 1 : m.support === "PARTIAL" ? .5 : 0);
  }, 0);
  const uncovered = new Set(ctx.job.requirements.map(r => r.id));
  const groups = new Set<string>();
  const entryIds: string[] = [];
  const allowed = new Set<string>();
  const warnings: string[] = [];
  const candidates = ctx.entities.filter(e => ["project", "experience"].includes(e.subject.type) && e.cvUsage !== "excluded" &&
    eligible.some(c => c.subject.id === e.subject.id && c.kind === "bullet"));
  while (entryIds.length < policy.maxEntries) {
    const next = candidates.filter(e => !entryIds.includes(e.subject.id) && (!e.exclusiveGroup || !groups.has(e.exclusiveGroup)))
      .map(e => ({ e, score: benefit(new Set(eligible.filter(c => c.subject.id === e.subject.id && c.kind === "bullet").map(c => c.id)), uncovered) }))
      .sort((a, b) => b.score - a.score || a.e.subject.id.localeCompare(b.e.subject.id))[0];
    // Do not pad with unrelated work. The user can add a historical entry explicitly later.
    if (!next || next.score <= 0) break;
    entryIds.push(next.e.subject.id);
    if (next.e.exclusiveGroup) groups.add(next.e.exclusiveGroup);
    const entryClaims = eligible.filter(c => c.subject.id === next.e.subject.id && c.kind === "bullet")
      .sort((a, b) => benefit(new Set([b.id]), uncovered) - benefit(new Set([a.id]), uncovered) || a.id.localeCompare(b.id))
      .slice(0, policy.maxBulletsPerEntry * 2);
    for (const c of entryClaims) allowed.add(c.id);
    for (const m of ctx.matches) if (m.support === "SUPPORTED" && m.claimIds.some(id => allowed.has(id))) uncovered.delete(m.requirementId);
    if (!next.e.metadataApproved) warnings.push(`Confirm source metadata before export: ${next.e.subject.id}`);
  }
  // Summary and skills are ranked for relevance too. Credentials remain source-linked.
  for (const kind of ["summary", "skill", "education", "certification"] as const) {
    const cap = kind === "summary" ? policy.maxSummaryClaims * 2 : kind === "skill" ? policy.maxSkills * 2 : policy.maxCredentialClaims;
    const extras = eligible.filter(c => c.kind === kind &&
      (["education", "certification"].includes(kind) || entryIds.includes(c.subject.id) ||
        benefit(new Set([c.id]), new Set(reqWeights.keys())) > 0))
      .sort((a,b) => benefit(new Set([b.id]), new Set(reqWeights.keys())) - benefit(new Set([a.id]), new Set(reqWeights.keys())) || a.id.localeCompare(b.id)).slice(0,cap);
    for (const c of extras) allowed.add(c.id);
  }
  const coverage = ctx.job.requirements.map(r => {
    const match = ctx.matches.find(m => m.requirementId === r.id);
    const claimIds = (match?.claimIds ?? []).filter(id => allowed.has(id) && available.has(id));
    const support = claimIds.length > 0 ? (match?.support ?? "UNKNOWN") : "UNKNOWN";
    if (r.importance === "MUST" && support !== "SUPPORTED") warnings.push(`Unresolved/partial must-have in selected evidence: ${r.id}`);
    return { requirementId: r.id, support, claimIds };
  });
  if (!entryIds.length) warnings.push("No role-relevant approved work claims. Reuse Apply OS retrieval/claim review; do not invent content.");
  const body = {version:"1.0.0" as const, contextHash:contextHash(ctx), policyHash:hash(policy), scope:ctx.scope,
    entryIds, allowedClaimIds:[...allowed], coverage, warnings};
  return {...body, id:hash(body)};
}
