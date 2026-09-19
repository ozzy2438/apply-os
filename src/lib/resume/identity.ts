import { createHash } from "node:crypto";
import type { ClaimCard, ResumeContext, ResumeDraft, ResumePolicy } from "./types";
export function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  throw new Error("NON_JSON_VALUE");
}
export function hash(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
export function claimHash(claim: ClaimCard): string {
  const { approval: _approval, ...payload } = claim;
  return hash(payload);
}
export function contextHash(ctx: ResumeContext): string { return hash(ctx); }
export function draftHash(ctx: ResumeContext, draft: ResumeDraft, policy: ResumePolicy): string {
  return hash({ context: contextHash(ctx), draft, policy, renderer: "single-column-v1" });
}
/** Null disables caching for unpinned/floating model aliases. Cache scope includes tenant. */
export function evaluationCacheKey(ctx: ResumeContext, draft: ResumeDraft, policy: ResumePolicy,
  rubricHash: string, reviewerRevision: string | null): string | null {
  if (!reviewerRevision || /(latest|preview|mock)/i.test(reviewerRevision)) return null;
  return hash({ scope: ctx.scope, context: contextHash(ctx), draft, policy, rubricHash, reviewerRevision });
}
