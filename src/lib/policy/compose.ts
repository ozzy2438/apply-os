import type {
  DeterministicResults,
  JobEvaluation,
  SemanticSignals,
  StructuredJobDecision,
} from "@/lib/domain/schemas";
import type { Recommendation } from "@/lib/domain/enums";
import { DEFAULT_FIT_WEIGHTS, DEFAULT_THRESHOLDS, POLICY_VERSION } from "./version";

export type FitWeights = {
  roleFit: number;
  skillsFit: number;
  seniorityFit: number;
  strategicValue: number;
};

export function composeFitScore(decision: StructuredJobDecision, weights: FitWeights = DEFAULT_FIT_WEIGHTS): number {
  const sum = weights.roleFit + weights.skillsFit + weights.seniorityFit + weights.strategicValue || 1;
  return (
    (decision.roleFit.score * weights.roleFit +
      decision.skillsFit.score * weights.skillsFit +
      decision.seniorityFit.score * weights.seniorityFit +
      decision.strategicValue.score * weights.strategicValue) /
    sum
  );
}

export function semanticFromDecision(decision: StructuredJobDecision): SemanticSignals {
  return {
    roleFitScore: decision.roleFit.score,
    roleFitConfidence: decision.roleFit.confidence,
    skillsFitScore: decision.skillsFit.score,
    skillsFitConfidence: decision.skillsFit.confidence,
    seniorityFitScore: decision.seniorityFit.score,
    seniorityFitConfidence: decision.seniorityFit.confidence,
    strategicValueScore: decision.strategicValue.score,
    strategicValueConfidence: decision.strategicValue.confidence,
    missingInformationProbability: decision.missingInformation.probability,
    redFlagProbability: decision.redFlag.probability,
    recommendation: decision.recommendation.choice,
    recommendationConfidence: decision.recommendation.confidence,
  };
}

export function applyPostJevPolicy(input: {
  deterministic: DeterministicResults;
  decision: StructuredJobDecision;
  evidenceReady: boolean;
  thresholds?: {
    applyMinimumScore: number;
    reviewMinimumScore: number;
    minimumDecisionConfidence: number;
  };
  weights?: FitWeights;
}): { finalFitScore: number; finalDecision: Recommendation; reasons: string[] } {
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS;
  const finalFitScore = composeFitScore(input.decision, input.weights);
  const reasons: string[] = [];

  if (input.deterministic.hardBlockers.length) {
    reasons.push(...input.deterministic.hardBlockers.map((b) => `Hard blocker: ${b}`));
    return { finalFitScore, finalDecision: "SKIP", reasons };
  }

  const missingCritical =
    input.decision.missingInformation.value ||
    input.decision.missingInformation.probability >= 0.6 ||
    (input.deterministic.salaryCompatible == null &&
      input.deterministic.workAuthorizationCompatible == null &&
      input.decision.missingInformation.probability >= 0.45);

  if (missingCritical) {
    reasons.push("Missing critical information — do not treat extracted fields as certain.");
  }
  if (input.decision.recommendation.confidence < thresholds.minimumDecisionConfidence) {
    reasons.push(
      `Decision confidence ${input.decision.recommendation.confidence.toFixed(2)} is below ${thresholds.minimumDecisionConfidence}.`,
    );
  }
  if (!input.evidenceReady) {
    reasons.push("Verified evidence is not ready enough for an apply recommendation.");
  }
  if (input.decision.redFlag.value || input.decision.redFlag.probability >= 0.8) {
    reasons.push("Likely red flag from structured scoring.");
  }

  const lowConfidence = input.decision.recommendation.confidence < thresholds.minimumDecisionConfidence;
  const applyOk =
    !input.deterministic.hardBlockers.length &&
    input.evidenceReady &&
    finalFitScore >= thresholds.applyMinimumScore &&
    input.decision.recommendation.confidence >= thresholds.minimumDecisionConfidence &&
    !missingCritical &&
    !input.decision.redFlag.value;

  if (applyOk && input.decision.recommendation.choice === "APPLY_CANDIDATE") {
    reasons.unshift(`Fit ${Math.round(finalFitScore * 100)}/100 with sufficient confidence.`);
    return { finalFitScore, finalDecision: "APPLY_CANDIDATE", reasons };
  }

  if (finalFitScore < thresholds.reviewMinimumScore && input.decision.recommendation.choice === "SKIP") {
    reasons.unshift("Fit below review threshold.");
    return { finalFitScore, finalDecision: "SKIP", reasons };
  }

  if (lowConfidence || missingCritical || input.decision.recommendation.choice === "REVIEW_REQUIRED") {
    reasons.unshift("Routed to review — high fit never overrides low confidence or ambiguity.");
    return { finalFitScore, finalDecision: "REVIEW_REQUIRED", reasons };
  }

  if (input.decision.recommendation.choice === "SKIP") {
    reasons.unshift("Structured recommendation is skip.");
    return { finalFitScore, finalDecision: "SKIP", reasons };
  }

  reasons.unshift("Defaulting to human review.");
  return { finalFitScore, finalDecision: "REVIEW_REQUIRED", reasons };
}

export function buildEvaluation(input: {
  id: string;
  jobId: string;
  candidateProfileVersion: number;
  deterministic: DeterministicResults;
  decision: StructuredJobDecision;
  evidenceReady: boolean;
  evaluatedAt: string;
  thresholds?: {
    applyMinimumScore: number;
    reviewMinimumScore: number;
    minimumDecisionConfidence: number;
  };
  weights?: FitWeights;
}): JobEvaluation {
  const post = applyPostJevPolicy(input);
  return {
    id: input.id,
    jobId: input.jobId,
    candidateProfileVersion: input.candidateProfileVersion,
    policyVersion: POLICY_VERSION,
    deterministicResults: input.deterministic,
    semanticSignals: semanticFromDecision(input.decision),
    finalFitScore: post.finalFitScore,
    finalDecision: post.finalDecision,
    explanationReasons: post.reasons,
    evaluatedAt: input.evaluatedAt,
  };
}

export function explanationFromEvaluation(evaluation: JobEvaluation): string {
  const s = evaluation.semanticSignals;
  const lines = [
    evaluation.finalDecision === "APPLY_CANDIDATE"
      ? "Recommended as an apply candidate because:"
      : evaluation.finalDecision === "SKIP"
        ? "Recommended to skip because:"
        : "Recommended for review because:",
    `- Role alignment: ${Math.round(s.roleFitScore * 100)}/100 (confidence ${Math.round(s.roleFitConfidence * 100)})`,
    `- Skills / evidence: ${Math.round(s.skillsFitScore * 100)}/100`,
    `- Seniority: ${Math.round(s.seniorityFitScore * 100)}/100`,
    `- Strategic value: ${Math.round(s.strategicValueScore * 100)}/100`,
    `- Missing-information probability: ${Math.round(s.missingInformationProbability * 100)}%`,
    `- Red-flag probability: ${Math.round(s.redFlagProbability * 100)}%`,
    `- Final fit ${Math.round(evaluation.finalFitScore * 100)}/100 · decision ${evaluation.finalDecision}`,
    ...evaluation.explanationReasons.map((r) => `- ${r}`),
  ];
  return lines.join("\n");
}
