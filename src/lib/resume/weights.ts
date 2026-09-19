import { DIMENSIONS, type Weights } from "./types";
/** Numeric profiles retained from the supplied ranker. Uncalibrated design defaults. */
export const WEIGHTS: Record<string, Weights> = {
  "data-analyst": {
    "role_evidence_match": 0.16,
    "stakeholder_evidence": 0.2,
    "technical_depth": 0.1,
    "quantified_impact": 0.12,
    "delivery_ownership": 0.1,
    "domain_alignment": 0.12,
    "keyword_alignment": 0.08,
    "evidence_verifiability": 0.08,
    "timeline_clarity": 0.04
  },
  "data-scientist": {
    "role_evidence_match": 0.16,
    "stakeholder_evidence": 0.14,
    "technical_depth": 0.18,
    "quantified_impact": 0.14,
    "delivery_ownership": 0.1,
    "domain_alignment": 0.12,
    "keyword_alignment": 0.06,
    "evidence_verifiability": 0.06,
    "timeline_clarity": 0.04
  },
  "mlops": {
    "role_evidence_match": 0.18,
    "stakeholder_evidence": 0.08,
    "technical_depth": 0.26,
    "quantified_impact": 0.12,
    "delivery_ownership": 0.14,
    "domain_alignment": 0.06,
    "keyword_alignment": 0.08,
    "evidence_verifiability": 0.05,
    "timeline_clarity": 0.03
  },
  "analytics-engineer": {
    "role_evidence_match": 0.18,
    "stakeholder_evidence": 0.12,
    "technical_depth": 0.22,
    "quantified_impact": 0.12,
    "delivery_ownership": 0.12,
    "domain_alignment": 0.08,
    "keyword_alignment": 0.08,
    "evidence_verifiability": 0.05,
    "timeline_clarity": 0.03
  },
  "ai-engineer": {
    "role_evidence_match": 0.18,
    "stakeholder_evidence": 0.08,
    "technical_depth": 0.26,
    "quantified_impact": 0.12,
    "delivery_ownership": 0.14,
    "domain_alignment": 0.06,
    "keyword_alignment": 0.08,
    "evidence_verifiability": 0.05,
    "timeline_clarity": 0.03
  },
  "public-sector-analyst": {
    "role_evidence_match": 0.14,
    "stakeholder_evidence": 0.24,
    "technical_depth": 0.08,
    "quantified_impact": 0.1,
    "delivery_ownership": 0.1,
    "domain_alignment": 0.14,
    "keyword_alignment": 0.06,
    "evidence_verifiability": 0.09,
    "timeline_clarity": 0.05
  }
};
export const ROLE_TO_PROFILE: Record<string, string> = {
  data_analytics_insights: "data-analyst", data_science: "data-scientist",
  ai_engineering: "ai-engineer", mlops_engineering: "mlops",
  analytics_engineering: "analytics-engineer",
};
/** No invented mapping for a family not explicitly covered by the original kit. */
export function weightsFor(roleFamilyId: string): { weights: Weights; warning: string | null } {
  const key = ROLE_TO_PROFILE[roleFamilyId] ?? roleFamilyId;
  const known = WEIGHTS[key];
  if (known) return { weights: structuredClone(known), warning: null };
  return { weights: Object.fromEntries(DIMENSIONS.map(d => [d, 1 / DIMENSIONS.length])) as Weights,
    warning: `No weight profile configured for ${roleFamilyId}; equal provisional weights used. Configure in Apply OS, not in candidate facts.` };
}
