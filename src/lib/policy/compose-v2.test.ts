import { describe, expect, it } from "vitest";
import { applyPostJevPolicy, composeFitScore } from "./compose";
import type { StructuredJobDecision } from "@/lib/domain/schemas";

function decision(over: Partial<StructuredJobDecision> = {}): StructuredJobDecision {
  const scored = { score: 0.85, confidence: 0.9, probabilities: { "4": 1 } };
  return {
    roleFit: scored,
    skillsFit: scored,
    seniorityFit: scored,
    strategicValue: scored,
    missingInformation: { value: false, probability: 0.1 },
    redFlag: { value: false, probability: 0.1 },
    recommendation: { choice: "APPLY_CANDIDATE", confidence: 0.88 },
    ...over,
  };
}

const cleanDeterministic = {
  isRecent: true,
  locationCompatible: true,
  workplaceCompatible: true,
  salaryCompatible: true,
  workAuthorizationCompatible: true,
  employmentTypeCompatible: true,
  roleNotExcluded: true,
  duplicateStatus: "UNIQUE" as const,
  closedOrExpired: false,
  redFlagHit: false,
  hardBlockers: [] as string[],
};

describe("v2 compose + post-Jev policy", () => {
  it("uses configurable weights and does not treat confidence as fit", () => {
    const fit = composeFitScore(decision(), { roleFit: 1, skillsFit: 0, seniorityFit: 0, strategicValue: 0 });
    expect(fit).toBeCloseTo(0.85, 5);
  });

  it("forces SKIP on any hard blocker", () => {
    const result = applyPostJevPolicy({
      deterministic: { ...cleanDeterministic, hardBlockers: ["Pay too low"] },
      decision: decision(),
      evidenceReady: true,
    });
    expect(result.finalDecision).toBe("SKIP");
  });

  it("routes high fit + low confidence to REVIEW_REQUIRED", () => {
    const result = applyPostJevPolicy({
      deterministic: cleanDeterministic,
      decision: decision({ recommendation: { choice: "APPLY_CANDIDATE", confidence: 0.4 } }),
      evidenceReady: true,
    });
    expect(result.finalDecision).toBe("REVIEW_REQUIRED");
  });
});
