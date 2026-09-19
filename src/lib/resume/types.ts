/** Server-side module contracts. Runtime checks live in validation.ts. */
export const DIMENSIONS = [
  "role_evidence_match", "stakeholder_evidence", "technical_depth",
  "quantified_impact", "delivery_ownership", "domain_alignment",
  "keyword_alignment", "evidence_verifiability", "timeline_clarity",
] as const;
export type DimensionId = typeof DIMENSIONS[number];
export type Weights = Record<DimensionId, number>;
export type SubjectKind = "project" | "experience" | "education" | "certification" | "candidate_fact";
export interface SubjectRef { type: SubjectKind; id: string }
export type EngagementType = "contract" | "freelance" | "independent" | "portfolio" | "employment" | "unknown";
export interface Scope {
  tenantId: string; candidateId: string; jobId: string;
  profileVersion: string; profileHash: string;
  decisionPolicyVersion: string; decisionPolicyHash: string; jobHash: string;
}
export interface Requirement {
  id: string; text: string; importance: "MUST" | "SHOULD" | "NICE" | "UNKNOWN";
  sourceQuote: string;
}
export interface SourceEntity {
  subject: SubjectRef;
  /** Source-supported PUBLIC label and title, never LLM-authored. */
  title: string; organisation: string | null; period: string | null;
  engagement: EngagementType | null;
  cvUsage: "preferred" | "standard" | "supporting" | "restricted" | "excluded";
  metadataApproved: boolean;
  /** Only genuine duplicate/phase groups; not every related-project edge. */
  exclusiveGroup: string | null;
  boundaries: string[];
}
export interface Evidence {
  id: string; subject: SubjectRef;
  sourceText: string; sourceDocument: string; sourceLocator: string | null;
  strength: "verified" | "documented" | "self_reported" | "uncertain";
}
export type ClaimKind = "summary" | "skill" | "bullet" | "education" | "certification";
export interface ClaimCard {
  id: string; subject: SubjectRef; kind: ClaimKind;
  /** Approved wording including its indispensable qualifiers. */
  text: string; evidenceIds: string[]; requiredQualifiers: string[];
  measurementContext: "client_production" | "client_delivery" | "held_out_evaluation" |
    "controlled_validation" | "backtest_or_simulation" | "synthetic_data" |
    "public_data_analysis" | "modelled_scenario" | "unstated" | "not_applicable";
  approval: {
    status: "approved" | "pending" | "blocked";
    method: "human" | "validated_claim_guard" | "none";
    profileHash: string; contentHash: string | null;
  };
}
export interface RequirementMatch {
  requirementId: string; claimIds: string[];
  support: "SUPPORTED" | "PARTIAL" | "UNSUPPORTED" | "UNKNOWN";
}
export interface ResumeContext {
  scope: Scope;
  /** Never sent to either model; rendered locally from authenticated profile. */
  header: { fullName: string; location: string; email: string | null; phone: string | null;
    links: { label: string; url: string }[] };
  job: { title: string; organisation: string; roleFamilyId: string;
    advertisement: string; requirements: Requirement[] };
  entities: SourceEntity[]; evidence: Evidence[]; claims: ClaimCard[];
  /** Results from existing Apply OS requirement matching, not keyword guesses. */
  matches: RequirementMatch[];
}
export interface ResumePolicy {
  version: string;
  /** Four entries includes employment AND selected projects; never four of each. */
  maxEntries: number; maxBulletsPerEntry: number; maxSummaryClaims: number;
  maxSkills: number; maxCredentialClaims: number; maxWords: number;
  maxRevisions: 0 | 1; timeoutMs: number; maxModelInputChars: number;
  confidenceFloor: number; readyScore: number; revisionScore: number;
  weights: Weights;
  /** Applicability is chosen by code/user for a job, NEVER by the scoring model. */
  notApplicableDimensions: DimensionId[];
  expectedPages: 1; minFontSizePt: number;
}
export interface ResumePlan {
  version: "1.0.0"; id: string; contextHash: string; policyHash: string;
  scope: Scope; entryIds: string[]; allowedClaimIds: string[];
  coverage: { requirementId: string; support: RequirementMatch["support"]; claimIds: string[] }[];
  warnings: string[];
}
export interface ResumeDraft {
  planId: string;
  summaryClaimIds: string[]; skillClaimIds: string[];
  entries: { subjectId: string; claimIds: string[] }[];
  educationClaimIds: string[]; certificationClaimIds: string[];
}
export interface GuardResult { passed: boolean; errors: string[]; warnings: string[]; draftHash: string }
export interface DimensionResult {
  id: DimensionId; raw: number; normalised: number; confidence: number;
  weight: number; uncertain: boolean; weightedShortfall: number;
}
export type ReadinessAssessment = "READY_FOR_HUMAN_REVIEW" | "NEEDS_TARGETED_REVISION" |
  "NEEDS_MAJOR_REVISION" | "NEEDS_HUMAN_REVIEW" | "REVIEW_UNAVAILABLE";
export interface ReviewResult {
  mode: "live" | "mock"; status: "scored" | "unavailable";
  requestedModel: string; resolvedModel: string | null;
  /** Resume communication quality only. Never probability of interview/hiring. */
  readinessScore: number | null; assessment: ReadinessAssessment;
  dimensions: DimensionResult[]; fixOrder: DimensionId[]; errorCode: string | null;
  draftHash: string; rubricHash: string; policyHash: string;
}
export interface WriterRequest {
  instructions: string;
  /** Minimal state: only plan-selected content, no personal contact information. */
  state: unknown;
  signal: AbortSignal;
  phase: "draft" | "revision";
}
export interface WriterPort { revision: string; mode: "live" | "template"; write(input: WriterRequest): Promise<unknown> }
export interface ReviewerPort {
  review(ctx: ResumeContext, plan: ResumePlan, draft: ResumeDraft, policy: ResumePolicy, signal: AbortSignal): Promise<ReviewResult>;
}
export interface StudioResult {
  generation: { mode: "live" | "template" | "not_run"; writerRevision: string | null; writerCallAttempts: number };
  status: "AWAITING_HUMAN_REVIEW" | "NEEDS_REVISION" | "NEEDS_CLAIM_REVIEW" | "BLOCKED";
  plan: ResumePlan; draft: ResumeDraft | null; guard: GuardResult | null;
  review: ReviewResult | null; revisionAttempts: number; warnings: string[];
}
export interface LayoutReceipt {
  draftHash: string; artifactHash: string; rendererRevision: string;
  pageCount: number; minFontSizePt: number;
  extractedTextMatches: boolean; clippedContent: boolean;
  /** Generated by actual rendering/measurement; not a model estimate. */
  measured: boolean;
}
export interface HumanApproval {
  actorId: string; tenantId: string; candidateId: string;
  draftHash: string; artifactHash: string; approvedAt: string;
  acceptedWarnings: boolean;
}
export interface RewriteProposal { originalClaimId: string; text: string; evidenceIds: string[] }
