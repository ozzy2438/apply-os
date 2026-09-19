import { describe, expect, it } from "vitest";
import { composeEvaluation, gateOutcome, suggestedStatus, type EvaluationAnswers } from "./compose";
import { DEFAULT_WEIGHTS } from "./questions";
import type { ActionId } from "./types";

function noul(value: number) {
  return { type: "noul" as const, noul: value };
}

function score(value: number, confidence = 0.9) {
  return {
    type: "score" as const,
    score: value,
    confidence,
    probabilities: { "0": 0.05, "1": 0.05, "2": 0.1, "3": 0.2, "4": 0.6 },
  };
}

function action(choice: ActionId, confidence: number): EvaluationAnswers["action"] {
  return {
    type: "choice",
    choice,
    confidence,
    probabilities: {
      apply_now: choice === "apply_now" ? confidence : 0.05,
      tailor_then_apply: choice === "tailor_then_apply" ? confidence : 0.05,
      skip: choice === "skip" ? confidence : 0.05,
      needs_review: choice === "needs_review" ? confidence : 0.05,
    },
  };
}

function answers(overrides: Partial<EvaluationAnswers> = {}): EvaluationAnswers {
  return {
    work_rights: noul(0.05),
    location: noul(0.05),
    compensation: noul(0.05),
    credential: noul(0.05),
    goal_alignment: score(4),
    cv_evidence: score(4),
    seniority_fit: score(4),
    domain_fit: score(4),
    comp_reality: score(4),
    action: action("apply_now", 0.9),
    ...overrides,
  };
}

describe("composeEvaluation", () => {
  it("fails a gate only at noul >= 0.8", () => {
    expect(gateOutcome(0.79)).toBe("review");
    expect(gateOutcome(0.8)).toBe("fail");
    expect(gateOutcome(0.19)).toBe("pass");
  });

  it("computes weighted fit and does not require a model to re-rank", () => {
    const even = composeEvaluation(answers(), DEFAULT_WEIGHTS);
    expect(even.fit).toBeCloseTo(1, 5);
    const skewed = composeEvaluation(answers({ goal_alignment: score(0), cv_evidence: score(0) }), {
      goal_alignment: 0.5,
      cv_evidence: 0.5,
      seniority_fit: 0,
      domain_fit: 0,
      comp_reality: 0,
    });
    expect(skewed.fit).toBeCloseTo(0, 5);
  });

  it("marks desk eligible only for high-confidence apply paths without hard fails", () => {
    const good = composeEvaluation(answers());
    expect(good.deskEligible).toBe(true);
    const gated = composeEvaluation(answers({ work_rights: noul(0.91) }));
    expect(gated.hardFail).toBe(true);
    expect(gated.deskEligible).toBe(false);
    expect(suggestedStatus(gated)).toBe("skipped");
    const meek = composeEvaluation(answers({ action: action("apply_now", 0.4) }));
    expect(meek.confidenceBand).toBe("low");
    expect(meek.deskEligible).toBe(false);
    expect(meek.label).toMatch(/Insufficient/);
  });
});
