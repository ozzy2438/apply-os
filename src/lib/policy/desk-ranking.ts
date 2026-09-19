import type { JobEvaluation, JobPosting } from "@/lib/domain/schemas";
import { DEFAULT_DESK_WEIGHTS } from "./version";

export type DeskWeights = typeof DEFAULT_DESK_WEIGHTS;

export type DeskCandidate = {
  job: JobPosting;
  evaluation: JobEvaluation;
  evidenceReadiness: number;
  preferenceScore: number;
};

function recencyScore(postedAt: string | null, now: Date): number {
  if (!postedAt) return 0.5;
  const days = (now.getTime() - new Date(postedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (Number.isNaN(days)) return 0.5;
  if (days <= 7) return 1;
  if (days <= 14) return 0.8;
  if (days <= 30) return 0.5;
  return 0.2;
}

export function deskScore(
  row: DeskCandidate,
  extras: { diversityScore: number; now?: Date; weights?: DeskWeights },
): number {
  const weights = extras.weights ?? DEFAULT_DESK_WEIGHTS;
  const now = extras.now ?? new Date();
  return (
    weights.finalFitScore * row.evaluation.finalFitScore +
    weights.recencyScore * recencyScore(row.job.postedAt, now) +
    weights.evidenceReadinessScore * row.evidenceReadiness +
    weights.strategicValueScore * row.evaluation.semanticSignals.strategicValueScore +
    weights.preferenceScore * row.preferenceScore +
    weights.diversityScore * extras.diversityScore
  );
}

export function rankMorningDesk(rows: DeskCandidate[], takeMax = 5, now = new Date()): DeskCandidate[] {
  const closed = new Set(["APPLIED", "INTERVIEW", "CLOSED", "ARCHIVED", "SKIP"]);
  const eligible = rows.filter(
    (row) =>
      row.evaluation.finalDecision === "APPLY_CANDIDATE" &&
      !closed.has(row.job.status) &&
      row.evaluation.deterministicResults.hardBlockers.length === 0 &&
      row.evaluation.semanticSignals.recommendationConfidence >= 0.75,
  );

  const selected: DeskCandidate[] = [];
  const remaining = [...eligible];
  while (selected.length < takeMax && remaining.length) {
    remaining.sort((a, b) => {
      const companies = new Set(selected.map((s) => (s.job.company ?? "").toLowerCase()));
      const da = companies.has((a.job.company ?? "").toLowerCase()) ? 0 : 1;
      const db = companies.has((b.job.company ?? "").toLowerCase()) ? 0 : 1;
      return deskScore(b, { diversityScore: db, now }) - deskScore(a, { diversityScore: da, now });
    });
    const next = remaining.shift();
    if (next) selected.push(next);
  }
  return selected;
}

export function preferenceScore(job: JobPosting, preferredLocations: string[]): number {
  const hay = `${job.location ?? ""} ${job.country ?? ""} ${job.workplaceType}`.toLowerCase();
  if (preferredLocations.some((l) => hay.includes(l.toLowerCase()))) return 1;
  if (job.workplaceType === "REMOTE") return 0.7;
  if (job.workplaceType === "UNKNOWN") return 0.4;
  return 0.2;
}
