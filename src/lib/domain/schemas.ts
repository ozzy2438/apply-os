import { z } from "zod";
import {
  AUDIT_EVENTS,
  CANONICAL_STATUSES,
  CLAIM_ACTIONS,
  CLAIM_CATEGORIES,
  CLAIM_STATUSES,
  DUPLICATE_STATUSES,
  EMPLOYMENT_TYPES,
  EVIDENCE_TYPES,
  JOB_SOURCES,
  MODEL_PROVIDERS,
  RECOMMENDATIONS,
  SALARY_PERIODS,
  SENIORITY_LEVELS,
  VERIFICATION_METHODS,
  WORKPLACE_TYPES,
} from "./enums";

export const applicationRulesSchema = z.object({
  applyRecommendationMinimumScore: z.number().min(0).max(1),
  reviewRecommendationMinimumScore: z.number().min(0).max(1),
  minimumDecisionConfidence: z.number().min(0).max(1),
  requireHumanApprovalForSubmission: z.boolean(),
  blockUnsupportedClaims: z.boolean(),
});

export const candidateProfileSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  targetRoles: z.array(z.string()),
  excludedRoles: z.array(z.string()),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  preferredLocations: z.array(z.string()),
  acceptedWorkplaceTypes: z.array(z.enum(["REMOTE", "HYBRID", "ONSITE"])),
  acceptedEmploymentTypes: z.array(z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "CASUAL"])),
  seniorityTargets: z.array(z.enum(["JUNIOR", "MID", "SENIOR", "LEAD"])),
  minimumSalary: z.object({
    amount: z.number().nullable(),
    currency: z.string(),
    period: z.enum(SALARY_PERIODS),
  }),
  workAuthorizationCountries: z.array(z.string()),
  visaConstraints: z.array(z.string()),
  industriesOfInterest: z.array(z.string()),
  industriesToAvoid: z.array(z.string()),
  explicitRedFlags: z.array(z.string()),
  applicationRules: applicationRulesSchema,
  maxJobAgeDays: z.number().int().positive(),
});

export const candidateEvidenceSchema = z.object({
  id: z.string(),
  candidateProfileId: z.string(),
  type: z.enum(EVIDENCE_TYPES),
  claim: z.string(),
  sourceReference: z.string(),
  sourceText: z.string(),
  skills: z.array(z.string()),
  domains: z.array(z.string()),
  yearsOfExperience: z.number().nullable(),
  verified: z.boolean(),
  verificationMethod: z.enum(VERIFICATION_METHODS),
});

export const jobPostingSchema = z.object({
  id: z.string(),
  userId: z.string(),
  source: z.enum(JOB_SOURCES),
  sourceUrl: z.string().nullable(),
  sourceExternalId: z.string().nullable(),
  title: z.string(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  country: z.string().nullable(),
  workplaceType: z.enum(WORKPLACE_TYPES),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  seniority: z.enum(SENIORITY_LEVELS),
  postedAt: z.string().nullable(),
  applicationDeadline: z.string().nullable(),
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  salaryCurrency: z.string().nullable(),
  salaryPeriod: z.enum(SALARY_PERIODS).nullable(),
  descriptionRaw: z.string(),
  responsibilities: z.array(z.string()),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  benefits: z.array(z.string()),
  visaRequirements: z.array(z.string()),
  status: z.enum(CANONICAL_STATUSES),
  extractionConfidence: z.number().min(0).max(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const scoredSignalSchema = z.object({
  score: z.number(),
  confidence: z.number(),
  probabilities: z.record(z.string(), z.number()),
});

export const deterministicResultsSchema = z.object({
  isRecent: z.boolean(),
  locationCompatible: z.boolean().nullable(),
  workplaceCompatible: z.boolean().nullable(),
  salaryCompatible: z.boolean().nullable(),
  workAuthorizationCompatible: z.boolean().nullable(),
  employmentTypeCompatible: z.boolean().nullable(),
  roleNotExcluded: z.boolean(),
  duplicateStatus: z.enum(DUPLICATE_STATUSES),
  closedOrExpired: z.boolean(),
  redFlagHit: z.boolean(),
  hardBlockers: z.array(z.string()),
});

export const semanticSignalsSchema = z.object({
  roleFitScore: z.number(),
  roleFitConfidence: z.number(),
  skillsFitScore: z.number(),
  skillsFitConfidence: z.number(),
  seniorityFitScore: z.number(),
  seniorityFitConfidence: z.number(),
  strategicValueScore: z.number(),
  strategicValueConfidence: z.number(),
  missingInformationProbability: z.number(),
  redFlagProbability: z.number(),
  recommendation: z.enum(RECOMMENDATIONS),
  recommendationConfidence: z.number(),
});

export const jobEvaluationSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  candidateProfileVersion: z.number(),
  policyVersion: z.string(),
  deterministicResults: deterministicResultsSchema,
  semanticSignals: semanticSignalsSchema,
  finalFitScore: z.number(),
  finalDecision: z.enum(RECOMMENDATIONS),
  explanationReasons: z.array(z.string()),
  evaluatedAt: z.string(),
});

export const atomicClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  claimCategory: z.enum(CLAIM_CATEGORIES),
  extractedEntities: z.array(z.string()),
});

export const claimVerificationDecisionSchema = z.object({
  status: z.enum(CLAIM_STATUSES),
  confidence: z.number(),
  matchingEvidenceIds: z.array(z.string()),
  requiredAction: z.enum(CLAIM_ACTIONS),
});

export const decisionAuditSchema = z.object({
  id: z.string(),
  userId: z.string(),
  jobId: z.string().nullable(),
  eventType: z.enum(AUDIT_EVENTS),
  profileVersion: z.number().nullable(),
  policyVersion: z.string().nullable(),
  modelProvider: z.enum(MODEL_PROVIDERS).nullable(),
  modelVersion: z.string().nullable(),
  inputHash: z.string().nullable(),
  observationVersion: z.string().nullable(),
  decisionSummary: z.record(z.string(), z.unknown()),
  policyResult: z.record(z.string(), z.unknown()),
  executionResult: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

export const structuredJobDecisionSchema = z.object({
  roleFit: scoredSignalSchema,
  skillsFit: scoredSignalSchema,
  seniorityFit: scoredSignalSchema,
  strategicValue: scoredSignalSchema,
  missingInformation: z.object({
    value: z.boolean(),
    probability: z.number(),
  }),
  redFlag: z.object({
    value: z.boolean(),
    probability: z.number(),
  }),
  recommendation: z.object({
    choice: z.enum(RECOMMENDATIONS),
    confidence: z.number(),
  }),
});

export type CandidateProfile = z.infer<typeof candidateProfileSchema>;
export type CandidateEvidence = z.infer<typeof candidateEvidenceSchema>;
export type JobPosting = z.infer<typeof jobPostingSchema>;
export type JobEvaluation = z.infer<typeof jobEvaluationSchema>;
export type DeterministicResults = z.infer<typeof deterministicResultsSchema>;
export type SemanticSignals = z.infer<typeof semanticSignalsSchema>;
export type AtomicClaim = z.infer<typeof atomicClaimSchema>;
export type ClaimVerificationDecision = z.infer<typeof claimVerificationDecisionSchema>;
export type DecisionAudit = z.infer<typeof decisionAuditSchema>;
export type StructuredJobDecision = z.infer<typeof structuredJobDecisionSchema>;
export type ApplicationRules = z.infer<typeof applicationRulesSchema>;
