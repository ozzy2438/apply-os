export const POLICY_VERSION = process.env.APPLY_OS_POLICY_VERSION?.trim() || "v2.0.0";

export const DEFAULT_FIT_WEIGHTS = {
  roleFit: 0.3,
  skillsFit: 0.35,
  seniorityFit: 0.15,
  strategicValue: 0.2,
} as const;

export const DEFAULT_DESK_WEIGHTS = {
  finalFitScore: 0.35,
  recencyScore: 0.2,
  evidenceReadinessScore: 0.15,
  strategicValueScore: 0.15,
  preferenceScore: 0.1,
  diversityScore: 0.05,
} as const;

export const DEFAULT_THRESHOLDS = {
  applyMinimumScore: 0.7,
  reviewMinimumScore: 0.45,
  minimumDecisionConfidence: 0.75,
  gateFail: 0.8,
  maxJobAgeDays: 45,
} as const;
