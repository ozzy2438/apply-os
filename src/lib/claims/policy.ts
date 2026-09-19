import type { ClaimVerificationDecision } from "@/lib/domain/schemas";

export function claimRequiredAction(status: ClaimVerificationDecision["status"]): ClaimVerificationDecision["requiredAction"] {
  if (status === "UNSUPPORTED") return "BLOCK";
  if (status === "SUPPORTED") return "ALLOW";
  return "REVIEW";
}

export function letterReadyFromClaims(
  decisions: ClaimVerificationDecision[],
  blockUnsupported: boolean,
): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!decisions.length) blockers.push("No factual claims were extracted to verify.");
  for (const d of decisions) {
    if (blockUnsupported && d.status === "UNSUPPORTED") {
      blockers.push("Unsupported claim blocks Ready.");
    }
    if (d.status === "AMBIGUOUS") blockers.push("Ambiguous claim requires user review.");
    if (d.status === "PARTIALLY_SUPPORTED") blockers.push("Partially supported claim needs weaker wording or more evidence.");
  }
  return { ready: blockers.length === 0 && decisions.length > 0, blockers };
}

export function claimExplanation(input: {
  text: string;
  decision: ClaimVerificationDecision;
  evidenceLabels: string[];
}): string {
  if (input.decision.status === "UNSUPPORTED") {
    return `Blocked because this draft says “${input.text}”, but no verified evidence currently supports it.`;
  }
  if (input.decision.status === "PARTIALLY_SUPPORTED") {
    return `Needs a weaker wording: “${input.text}” only partially matches ${input.evidenceLabels.join(", ") || "existing evidence"}.`;
  }
  if (input.decision.status === "AMBIGUOUS") {
    return `Review “${input.text}” — confidence ${Math.round(input.decision.confidence * 100)} is not enough to auto-accept.`;
  }
  return `Allowed: “${input.text}” is supported by ${input.evidenceLabels.join(", ") || "verified evidence"} (${Math.round(input.decision.confidence * 100)} confidence).`;
}
