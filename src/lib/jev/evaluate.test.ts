import { describe, expect, it } from "vitest";
import { evaluateOpportunity } from "./evaluate";
import { SAMPLE_BULLETS, SAMPLE_CONSTRAINTS, SAMPLE_GOALS, SAMPLE_POSTINGS, SAMPLE_WEIGHTS } from "@/lib/seed/fixtures";

describe("evaluateOpportunity", () => {
  it("returns typed compose output from the mock client", async () => {
    const posting = SAMPLE_POSTINGS.find((p) => p.id === "job-horizon")!;
    const result = await evaluateOpportunity(
      {
        posting,
        profile: {
          goals: SAMPLE_GOALS,
          constraints: SAMPLE_CONSTRAINTS,
          cv: SAMPLE_BULLETS,
        },
      },
      SAMPLE_WEIGHTS,
    );
    expect(result.demo).toBe(true);
    expect(result.composed.deskEligible).toBe(true);
    expect(result.composed.action).toBe("apply_now");
    expect(result.answers.work_rights.noul).toBeLessThan(0.2);
  });
});
