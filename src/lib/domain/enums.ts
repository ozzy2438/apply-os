export const WORKPLACE_TYPES = ["REMOTE", "HYBRID", "ONSITE", "UNKNOWN"] as const;
export type WorkplaceType = (typeof WORKPLACE_TYPES)[number];

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "CASUAL", "UNKNOWN"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const SENIORITY_LEVELS = ["JUNIOR", "MID", "SENIOR", "LEAD", "UNKNOWN"] as const;
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];

export const JOB_SOURCES = ["MANUAL", "URL_IMPORT", "LINKEDIN", "SEEK", "INDEED", "OTHER"] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const CANONICAL_STATUSES = [
  "NEW",
  "EVALUATING",
  "APPLY_CANDIDATE",
  "REVIEW_REQUIRED",
  "SKIP",
  "SAVED",
  "READY",
  "APPLIED",
  "INTERVIEW",
  "CLOSED",
  "ARCHIVED",
] as const;
export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];

export const RECOMMENDATIONS = ["APPLY_CANDIDATE", "REVIEW_REQUIRED", "SKIP"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const TRIAGE_BUCKETS = [
  "HARD_REJECT",
  "LOW_PRIORITY_ARCHIVE",
  "DEEP_REVIEW",
  "HUMAN_REVIEW",
] as const;
export type TriageBucket = (typeof TRIAGE_BUCKETS)[number];

export const DUPLICATE_STATUSES = ["UNIQUE", "POSSIBLE_DUPLICATE", "DUPLICATE"] as const;
export type DuplicateStatus = (typeof DUPLICATE_STATUSES)[number];

export const EVIDENCE_TYPES = [
  "WORK_EXPERIENCE",
  "PROJECT",
  "EDUCATION",
  "CERTIFICATION",
  "PORTFOLIO",
  "SKILL",
  "ACHIEVEMENT",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const VERIFICATION_METHODS = ["USER_CONFIRMED", "CV_EXTRACTED", "PORTFOLIO_LINKED", "MANUAL_REVIEW"] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export const CLAIM_CATEGORIES = [
  "SKILL",
  "EXPERIENCE",
  "ACHIEVEMENT",
  "METRIC",
  "EDUCATION",
  "CERTIFICATION",
  "WORK_AUTHORIZATION",
  "OTHER",
] as const;
export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

export const CLAIM_STATUSES = ["SUPPORTED", "PARTIALLY_SUPPORTED", "UNSUPPORTED", "AMBIGUOUS"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_ACTIONS = ["ALLOW", "REVIEW", "BLOCK"] as const;
export type ClaimAction = (typeof CLAIM_ACTIONS)[number];

export const SALARY_PERIODS = ["YEAR", "DAY", "HOUR"] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const AUDIT_EVENTS = [
  "JOB_IMPORTED",
  "JOB_EXTRACTED",
  "JOB_EVALUATED",
  "BROWSER_ACTION_PROPOSED",
  "BROWSER_ACTION_EXECUTED",
  "BROWSER_ACTION_BLOCKED",
  "COVER_LETTER_GENERATED",
  "CLAIM_VERIFIED",
  "APPLICATION_STATUS_CHANGED",
  "RESUME_BUILT",
  "RESUME_APPROVED",
  "RESUME_EXISTING_REVIEWED",
  "RESUME_INTENT",
] as const;
export type AuditEventType = (typeof AUDIT_EVENTS)[number];

export const MODEL_PROVIDERS = ["JEV", "OPENAI", "DEMO"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];
