import type { CandidateEvidence, CandidateProfile, JobPosting } from "@/lib/domain/schemas";

export type GeneratedLetter = {
  body: string;
  claims: Array<{ claim: string; evidenceId: string; quote: string }>;
  source: "llm" | "template" | "demo";
};

export type GenerationProvider = {
  name: "OPENAI" | "DEMO";
  draftCoverLetter(input: {
    job: JobPosting;
    candidate: CandidateProfile;
    evidence: CandidateEvidence[];
    tone: "conservative" | "warm" | "direct";
    maxWords: number;
  }): Promise<GeneratedLetter>;
  draftRecruiterMessage(input: {
    job: JobPosting;
    candidate: CandidateProfile;
    evidence: CandidateEvidence[];
  }): Promise<{ body: string; source: "llm" | "template" | "demo" }>;
  summarizeJob(input: { job: JobPosting }): Promise<string>;
  draftApplicationAnswer(input: { question: string; evidence: CandidateEvidence[] }): Promise<string>;
};
