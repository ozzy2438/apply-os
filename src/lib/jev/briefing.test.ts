import { describe, expect, it } from "vitest";
import { selectMorningDesk } from "./briefing";
import { composeEvaluation, type EvaluationAnswers } from "./compose";
import { heuristicEvaluationAnswers } from "./mock";
import { SAMPLE_BULLETS, SAMPLE_CONSTRAINTS, SAMPLE_GOALS, SAMPLE_POSTINGS, SAMPLE_WEIGHTS } from "@/lib/seed/fixtures";
import type { Opportunity } from "./types";

function asOpp(id: string, status: Opportunity["status"] = "inbox"): Opportunity {
  const posting = SAMPLE_POSTINGS.find((p) => p.id === id)!;
  return {
    id,
    sourceType: posting.sourceType,
    title: posting.title,
    company: posting.company,
    location: posting.location,
    compensation: posting.compensation,
    url: posting.url,
    rawText: posting.rawText,
    status,
    createdAt: "2026-09-18T00:00:00.000Z",
  };
}

describe("morning desk", () => {
  it("selects at most 5 eligible high-fit roles and excludes skips", () => {
    const items = SAMPLE_POSTINGS.map((posting) => {
      const answers = heuristicEvaluationAnswers({
        posting,
        profile: {
          goals: SAMPLE_GOALS,
          constraints: SAMPLE_CONSTRAINTS,
          cv: SAMPLE_BULLETS,
        },
      }) as EvaluationAnswers;
      const composed = composeEvaluation(answers, SAMPLE_WEIGHTS);
      return { opportunity: asOpp(posting.id), composed };
    });

    const desk = selectMorningDesk(items, 5);
    expect(desk.length).toBeGreaterThanOrEqual(3);
    expect(desk.length).toBeLessThanOrEqual(5);
    expect(desk.every((row) => row.composed.deskEligible)).toBe(true);
    expect(desk.some((row) => row.opportunity.id === "job-nyc")).toBe(false);
    expect(desk.some((row) => row.opportunity.id === "job-grad")).toBe(false);
    expect(desk.some((row) => row.opportunity.id === "job-horizon")).toBe(true);
  });

  it("drops applied and skipped statuses", () => {
    const answers = heuristicEvaluationAnswers({
      posting: SAMPLE_POSTINGS[0],
      profile: { goals: SAMPLE_GOALS, constraints: SAMPLE_CONSTRAINTS, cv: SAMPLE_BULLETS },
    });
    const composed = composeEvaluation(answers, SAMPLE_WEIGHTS);
    const desk = selectMorningDesk([{ opportunity: asOpp("job-horizon", "skipped"), composed }], 5);
    expect(desk).toHaveLength(0);
  });
});
