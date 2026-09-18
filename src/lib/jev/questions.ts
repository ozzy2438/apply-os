import { choice, noul, score } from "@typesafe-ai/sdk";
import type { DimensionId, Weights } from "./types";

export const THRESHOLDS = {
  gateFail: 0.8,
  gateReview: 0.2,
  confidenceHigh: 0.75,
  confidenceLow: 0.45,
  citationAuto: 0.8,
  guardFail: 0.8,
} as const;

export const DEFAULT_WEIGHTS: Weights = {
  goal_alignment: 0.3,
  cv_evidence: 0.3,
  seniority_fit: 0.15,
  domain_fit: 0.15,
  comp_reality: 0.1,
};

export const SCORE_LEVELS = [
  "None — no meaningful signal, or a clear mismatch on this dimension.",
  "Weak — only incidental overlap; important gaps remain.",
  "Partial — real overlap with material gaps a hiring manager would notice.",
  "Strong — most of what this dimension cares about is honestly evidenced.",
  "Excellent — this dimension is a clear, defensible match.",
] as const;

export const DIMENSION_INSTRUCTIONS: Record<DimensionId, string> = {
  goal_alignment:
    "How strongly does `posting` advance the candidate's stated `profile.goals`? Judge trajectory, not keyword overlap.",
  cv_evidence:
    "How well can `profile.cv` honestly evidence the must-have requirements in `posting`? Penalise claims the CV cannot support.",
  seniority_fit:
    "How well does the seniority in `posting` match `profile.constraints.seniorityBand` given `profile.cv`? Stretch is partial, not excellent.",
  domain_fit:
    "How well does the industry or problem space in `posting` match the domains evidenced in `profile.cv`?",
  comp_reality:
    "How realistic is compensation in `posting` versus `profile.constraints.compensationFloorAud` (AUD)? Missing pay is partial, not a fail.",
};

export function evaluationQuestions() {
  return {
    work_rights: noul(
      "Does `posting` impose work-rights or citizenship requirements that `profile.constraints.workRights` cannot satisfy?",
      {
        true: "The posting requires a right to work, visa, or citizenship the candidate does not have.",
        false: "Work rights are compatible, unspecified, or clearly satisfied.",
      },
    ),
    location: noul(
      "Is the location or work-mode in `posting` impossible given `profile.constraints.locations` and `profile.constraints.workMode`?",
      {
        true: "Onsite-only in a city the candidate cannot work from, or remote policy that excludes them.",
        false: "Location and mode are compatible or flexible enough.",
      },
    ),
    compensation: noul(
      "Is the stated pay in `posting` clearly below `profile.constraints.compensationFloorAud` AUD?",
      {
        true: "A stated maximum or band is clearly under the floor.",
        false: "Pay meets the floor, is a range overlapping the floor, or is unstated.",
      },
    ),
    credential: noul(
      "Does `posting` require a mandatory credential (PhD, professional registration, security clearance) that `profile.cv` does not evidence?",
      {
        true: "A hard credential is required and absent from the CV.",
        false: "No such mandatory credential, or the CV evidences it.",
      },
    ),
    goal_alignment: score(DIMENSION_INSTRUCTIONS.goal_alignment, SCORE_LEVELS),
    cv_evidence: score(DIMENSION_INSTRUCTIONS.cv_evidence, SCORE_LEVELS),
    seniority_fit: score(DIMENSION_INSTRUCTIONS.seniority_fit, SCORE_LEVELS),
    domain_fit: score(DIMENSION_INSTRUCTIONS.domain_fit, SCORE_LEVELS),
    comp_reality: score(DIMENSION_INSTRUCTIONS.comp_reality, SCORE_LEVELS),
    action: choice("What should the candidate do with this `posting` given `profile`?", {
      apply_now:
        "High-fit, honest evidence, constraints work; apply with light tailoring at most.",
      tailor_then_apply:
        "Worth pursuing, but the CV or letter needs a targeted rewrite before sending.",
      skip: "Clear mismatch on goals, evidence, seniority, or constraints; do not apply.",
      needs_review:
        "Not enough information, mixed signals, or a judgment a human should make.",
    }),
  };
}

export function citationQuestion() {
  return {
    relation: choice("How does the CV evidence relate to the claim?", {
      supports: "The evidence states the claim or directly implies that it is true.",
      contradicts: "The evidence states the opposite of the claim or implies it is false.",
      says_nothing: "The evidence does not address what the claim asserts.",
    }),
  };
}

export function guardQuestions() {
  return {
    inflated_tenure: noul(
      "Does `letter` inflate years of experience or seniority beyond what `profile.cv` supports?",
    ),
    fake_production: noul(
      "Does `letter` claim live production ownership, enterprise operation, or named-client delivery that `profile.cv` does not support?",
    ),
    tools_not_in_cv: noul(
      "Does `letter` claim tools, platforms, or domains that do not appear in `profile.cv`?",
    ),
  };
}

export type EvaluationQuestions = ReturnType<typeof evaluationQuestions>;
