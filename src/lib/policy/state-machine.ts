import type { CanonicalStatus } from "@/lib/domain/enums";

const TRANSITIONS: Record<CanonicalStatus, CanonicalStatus[]> = {
  NEW: ["EVALUATING", "SKIP", "ARCHIVED"],
  EVALUATING: ["APPLY_CANDIDATE", "REVIEW_REQUIRED", "SKIP"],
  APPLY_CANDIDATE: ["SAVED", "REVIEW_REQUIRED", "SKIP", "READY"],
  REVIEW_REQUIRED: ["APPLY_CANDIDATE", "SKIP", "SAVED"],
  SKIP: ["REVIEW_REQUIRED", "ARCHIVED"],
  SAVED: ["READY", "SKIP", "REVIEW_REQUIRED", "APPLY_CANDIDATE"],
  READY: ["APPLIED", "REVIEW_REQUIRED", "SAVED"],
  APPLIED: ["INTERVIEW", "CLOSED"],
  INTERVIEW: ["CLOSED", "ARCHIVED", "APPLIED"],
  CLOSED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canTransition(from: CanonicalStatus, to: CanonicalStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: CanonicalStatus, to: CanonicalStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal status transition ${from} → ${to}`);
  }
}

export type GateContext = {
  letterReady: boolean;
  userReviewed: boolean;
  documentsSelected: boolean;
  hasSubmitApproval: boolean;
};

export function readyAllowed(ctx: GateContext): boolean {
  return ctx.userReviewed && ctx.letterReady && ctx.documentsSelected;
}

export function submitAllowed(ctx: GateContext): boolean {
  return ctx.hasSubmitApproval && ctx.letterReady;
}

export function nextAfterEvaluation(decision: "APPLY_CANDIDATE" | "REVIEW_REQUIRED" | "SKIP"): CanonicalStatus {
  return decision;
}
