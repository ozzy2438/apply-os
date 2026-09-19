export const SOURCE_TYPES = ["job_posting", "recruiter_inbound"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const STATUSES = [
  "inbox",
  "review",
  "ready",
  "applied",
  "interview",
  "offer",
  "rejected",
  "skipped",
] as const;
export type Status = (typeof STATUSES)[number];

export const GATE_IDS = ["work_rights", "location", "compensation", "credential"] as const;
export type GateId = (typeof GATE_IDS)[number];

export const DIMENSION_IDS = [
  "goal_alignment",
  "cv_evidence",
  "seniority_fit",
  "domain_fit",
  "comp_reality",
] as const;
export type DimensionId = (typeof DIMENSION_IDS)[number];

export const ACTION_IDS = ["apply_now", "tailor_then_apply", "skip", "needs_review"] as const;
export type ActionId = (typeof ACTION_IDS)[number];

export const BULLET_KINDS = [
  "delivery",
  "independent",
  "experiment",
  "backtest",
  "learning",
] as const;
export type BulletKind = (typeof BULLET_KINDS)[number];

export const CONFIDENCE_BANDS = ["high", "medium", "low"] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

export type GateOutcome = "pass" | "review" | "fail";

export type Weights = Record<DimensionId, number>;

export type Constraints = {
  workRights: string;
  locations: string[];
  workMode: string;
  compensationFloorAud: number;
  seniorityBand: string;
};

export type CvBullet = {
  id: string;
  text: string;
  kind: BulletKind;
  sortOrder: number;
};

export type Profile = {
  id: string;
  goals: string;
  constraints: Constraints;
  weights: Weights;
  bullets: CvBullet[];
  updatedAt: string;
};

export type PostingInput = {
  sourceType: SourceType;
  title: string;
  company: string;
  location: string;
  compensation: string | null;
  url: string | null;
  rawText: string;
};

export type EvaluationState = {
  posting: PostingInput;
  profile: {
    goals: string;
    constraints: Constraints;
    cv: Array<{ id: string; text: string; kind: BulletKind }>;
  };
};

export type GateResult = {
  id: GateId;
  noul: number;
  outcome: GateOutcome;
};

export type DimensionScore = {
  id: DimensionId;
  score: number;
  normalized: number;
  confidence: number;
  weight: number;
  probabilities: Record<string, number>;
};

export type ComposedEvaluation = {
  gates: GateResult[];
  hardFail: boolean;
  gateReview: boolean;
  dimensions: DimensionScore[];
  fit: number;
  action: ActionId;
  actionConfidence: number;
  actionProbabilities: Record<string, number>;
  confidenceBand: ConfidenceBand;
  deskEligible: boolean;
  rankingScore: number;
  label: string;
};

export type Claim = {
  claim: string;
  cvBulletId: string;
  quote: string;
};

export type CitationVerdict = "verified" | "unsupported" | "contradicted" | "fabricated";

export type CitationResult = {
  claim: Claim;
  status: "found" | "missing" | "section-only";
  relation: "supports" | "contradicts" | "says_nothing" | null;
  confidence: number | null;
  verdict: CitationVerdict;
  auto: boolean;
};

export type GuardId = "inflated_tenure" | "fake_production" | "tools_not_in_cv";

export type GuardResult = {
  id: GuardId;
  noul: number;
  failed: boolean;
};

export type AtomicClaimRecord = {
  text: string;
  category: string;
  status: string;
  confidence: number;
  requiredAction: string;
  explanation: string;
  matchingEvidenceIds: string[];
};

export type CoverLetterCheck = {
  citations: CitationResult[];
  guards: GuardResult[];
  ready: boolean;
  blockers: string[];
  atomic?: AtomicClaimRecord[];
};

export type Opportunity = {
  id: string;
  sourceType: SourceType;
  title: string;
  company: string;
  location: string;
  compensation: string | null;
  url: string | null;
  rawText: string;
  status: Status;
  createdAt: string;
};

export type StoredEvaluation = {
  id: string;
  opportunityId: string;
  model: string;
  demo: boolean;
  answers: unknown;
  composed: ComposedEvaluation;
  createdAt: string;
};

export type StoredCoverLetter = {
  id: string;
  opportunityId: string;
  body: string;
  claims: Claim[];
  check: CoverLetterCheck;
  createdAt: string;
};

export type Briefing = {
  date: string;
  opportunityIds: string[];
  createdAt: string;
};

export type StatusEvent = {
  id: string;
  opportunityId: string;
  status: Status;
  note: string | null;
  at: string;
};
