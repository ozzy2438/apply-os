import type {
  AtomicClaim,
  CandidateEvidence,
  CandidateProfile,
  ClaimVerificationDecision,
  JobPosting,
  StructuredJobDecision,
} from "@/lib/domain/schemas";
import type { BrowserActionDecision, BrowserActionSpace, BrowserObservation, BrowserTask } from "@/lib/browser/types";

export type DecisionProvider = {
  name: "JEV" | "DEMO";
  modelVersion: string;
  evaluateJob(input: {
    candidate: CandidateProfile;
    evidence: CandidateEvidence[];
    job: JobPosting;
    policyContext: {
      hardFilterResults: Record<string, unknown>;
      decisionThresholds: Record<string, number | boolean>;
    };
  }): Promise<StructuredJobDecision>;
  verifyClaim(input: {
    claim: AtomicClaim;
    candidateEvidence: CandidateEvidence[];
    job: JobPosting;
  }): Promise<ClaimVerificationDecision>;
  decideBrowserAction(input: {
    browserState: BrowserObservation;
    actionSpace: BrowserActionSpace;
    task: BrowserTask;
  }): Promise<BrowserActionDecision>;
};
