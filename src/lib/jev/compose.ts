import type {
  ActionId,
  ComposedEvaluation,
  ConfidenceBand,
  DimensionId,
  DimensionScore,
  GateId,
  GateResult,
  Weights,
} from "./types";
import { ACTION_IDS, DIMENSION_IDS, GATE_IDS } from "./types";
import { DEFAULT_WEIGHTS, THRESHOLDS } from "./questions";

export type NoulLike = { type: "noul"; noul: number };
export type ScoreLike = {
  type: "score";
  score: number;
  confidence: number;
  probabilities: Record<string, number> | { readonly [k: string]: number };
};
export type ChoiceLike = {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number> | { readonly [k: string]: number };
};

export type EvaluationAnswers = Record<GateId, NoulLike> &
  Record<DimensionId, ScoreLike> & { action: ChoiceLike };

export function gateOutcome(noul: number): GateResult["outcome"] {
  if (noul >= THRESHOLDS.gateFail) return "fail";
  if (noul >= THRESHOLDS.gateReview) return "review";
  return "pass";
}

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= THRESHOLDS.confidenceHigh) return "high";
  if (confidence >= THRESHOLDS.confidenceLow) return "medium";
  return "low";
}

function asAction(value: string): ActionId {
  return (ACTION_IDS as readonly string[]).includes(value) ? (value as ActionId) : "needs_review";
}

export function normalizeScore(score: number, maxLevel = 4): number {
  const clamped = Math.min(maxLevel, Math.max(0, score));
  return clamped / maxLevel;
}

export function composeEvaluation(
  answers: EvaluationAnswers,
  weights: Weights = DEFAULT_WEIGHTS,
): ComposedEvaluation {
  const gates: GateResult[] = GATE_IDS.map((id) => ({
    id,
    noul: answers[id].noul,
    outcome: gateOutcome(answers[id].noul),
  }));

  const hardFail = gates.some((g) => g.outcome === "fail");
  const gateReview = gates.some((g) => g.outcome === "review");

  const dimensions: DimensionScore[] = DIMENSION_IDS.map((id) => {
    const raw = answers[id];
    const weight = weights[id];
    return {
      id,
      score: raw.score,
      normalized: normalizeScore(raw.score),
      confidence: raw.confidence,
      weight,
      probabilities: { ...raw.probabilities },
    };
  });

  const weightSum = DIMENSION_IDS.reduce((sum, id) => sum + weights[id], 0) || 1;
  const fit = dimensions.reduce((sum, d) => sum + d.normalized * (d.weight / weightSum), 0);

  const action = asAction(answers.action.choice);
  const actionConfidence = answers.action.confidence;
  const band = confidenceBand(actionConfidence);

  const pursue = action === "apply_now" || action === "tailor_then_apply";
  const deskEligible = !hardFail && band === "high" && pursue;

  let label: string;
  if (hardFail) {
    const failed = gates.filter((g) => g.outcome === "fail").map((g) => g.id);
    label = `Hard gate failed (${failed.join(", ")})`;
  } else if (band === "low") {
    label = "Insufficient evidence — do not auto-rank";
  } else if (gateReview || band === "medium" || action === "needs_review") {
    label = "Review queue";
  } else if (action === "skip") {
    label = "Skip";
  } else if (action === "tailor_then_apply") {
    label = "Tailor, then apply";
  } else {
    label = "Apply now";
  }

  return {
    gates,
    hardFail,
    gateReview,
    dimensions,
    fit,
    action,
    actionConfidence,
    actionProbabilities: { ...answers.action.probabilities },
    confidenceBand: band,
    deskEligible,
    rankingScore: fit * actionConfidence,
    label,
  };
}

export function suggestedStatus(composed: ComposedEvaluation): "inbox" | "review" | "skipped" {
  if (composed.hardFail || composed.action === "skip") return "skipped";
  if (
    composed.gateReview ||
    composed.confidenceBand === "medium" ||
    composed.confidenceBand === "low" ||
    composed.action === "needs_review"
  ) {
    return "review";
  }
  return "inbox";
}
