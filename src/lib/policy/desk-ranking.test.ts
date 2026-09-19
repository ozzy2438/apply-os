import { describe, expect, it } from "vitest";
import { rankMorningDesk } from "./desk-ranking";
import { normalizeJobPosting } from "@/lib/ingest/normalize";
import { buildEvaluation } from "./compose";
import { runHardFilters } from "./hard-filters";
import { DEFAULT_CANDIDATE_PROFILE } from "@/lib/domain/defaults";

function candidate(id: string, company: string, title: string) {
  const job = normalizeJobPosting({
    id,
    rawText: `Title: ${title}\nCompany: ${company}\nLocation: Melbourne hybrid\nSalary: AUD $150,000\nRight to work in Australia. Must-haves: Python.`,
  });
  const deterministic = runHardFilters({ job, profile: DEFAULT_CANDIDATE_PROFILE, duplicateStatus: "UNIQUE" });
  const evaluation = buildEvaluation({
    id: `ev-${id}`,
    jobId: id,
    candidateProfileVersion: 1,
    deterministic,
    decision: {
      roleFit: { score: 0.9, confidence: 0.9, probabilities: {} },
      skillsFit: { score: 0.88, confidence: 0.9, probabilities: {} },
      seniorityFit: { score: 0.8, confidence: 0.85, probabilities: {} },
      strategicValue: { score: 0.82, confidence: 0.85, probabilities: {} },
      missingInformation: { value: false, probability: 0.1 },
      redFlag: { value: false, probability: 0.05 },
      recommendation: { choice: "APPLY_CANDIDATE", confidence: 0.88 },
    },
    evidenceReady: true,
    evaluatedAt: new Date().toISOString(),
  });
  return {
    job,
    evaluation,
    evidenceReadiness: 0.8,
    preferenceScore: 1,
  };
}

describe("desk ranking", () => {
  it("returns 3–5 and prefers company diversity", () => {
    const rows = [
      candidate("a", "Horizon", "Data Scientist"),
      candidate("b", "Horizon", "AI Engineer"),
      candidate("c", "Ledger", "Applied ML Engineer"),
      candidate("d", "Southbank", "AI Engineer"),
      candidate("e", "Pacific", "Data Scientist"),
      candidate("f", "Mallee", "Full-Stack Engineer"),
    ];
    const desk = rankMorningDesk(rows, 5);
    expect(desk.length).toBeGreaterThanOrEqual(3);
    expect(desk.length).toBeLessThanOrEqual(5);
    const companies = desk.map((r) => r.job.company);
    expect(new Set(companies).size).toBeGreaterThan(1);
  });
});
