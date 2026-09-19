import { describe, expect, it } from "vitest";
import { citationVerdict, composeCoverLetterCheck, guardResult } from "./citations";
import { heuristicGuards } from "./mock";
import type { CvBullet } from "./types";

const bullets: CvBullet[] = [
  {
    id: "cv-forecast",
    kind: "independent",
    sortOrder: 1,
    text: "Built a retail-fuel demand forecasting pipeline in Python with scheduled cloud jobs.",
  },
];

describe("citations", () => {
  it("marks missing quotes fabricated without a model call", () => {
    const result = citationVerdict(
      { claim: "I ran Snowflake streaming", cvBulletId: "cv-forecast", quote: "Snowflake streaming nightly" },
      bullets,
      null,
    );
    expect(result.verdict).toBe("fabricated");
    expect(result.auto).toBe(true);
  });

  it("maps supports to verified when confidence is high", () => {
    const result = citationVerdict(
      {
        claim: "Built a retail-fuel demand forecasting pipeline in Python.",
        cvBulletId: "cv-forecast",
        quote: "Built a retail-fuel demand forecasting pipeline in Python with scheduled cloud jobs.",
      },
      bullets,
      {
        type: "choice",
        choice: "supports",
        confidence: 0.93,
        probabilities: { supports: 0.93, contradicts: 0.04, says_nothing: 0.03 },
      },
    );
    expect(result.verdict).toBe("verified");
    expect(result.auto).toBe(true);
  });

  it("blocks ready on fabricated, contradicted, failed guards, or low-confidence citations", () => {
    const blocked = composeCoverLetterCheck(
      [
        {
          claim: { claim: "x", cvBulletId: "cv-forecast", quote: "nope" },
          status: "missing",
          relation: null,
          confidence: null,
          verdict: "fabricated",
          auto: true,
        },
      ],
      [guardResult("fake_production", { type: "noul", noul: 0.9 })],
    );
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers.length).toBeGreaterThan(1);

    const clean = composeCoverLetterCheck(
      [
        {
          claim: { claim: "forecasting pipeline", cvBulletId: "cv-forecast", quote: bullets[0].text },
          status: "found",
          relation: "supports",
          confidence: 0.93,
          verdict: "verified",
          auto: true,
        },
      ],
      [guardResult("fake_production", { type: "noul", noul: 0.1 })],
    );
    expect(clean.ready).toBe(true);
  });
});

describe("heuristicGuards", () => {
  const cv = "Independent product; production-style operation, not a named enterprise owner.";

  it("does not trip on a cover letter that refuses to invent ownership", () => {
    const letter =
      "Built a retail-fuel demand forecasting pipeline in Python. I would rather under-claim than invent live enterprise operation.";
    const guards = heuristicGuards(letter, cv);
    expect(guards.fake_production.noul).toBeLessThan(0.2);
  });

  it("trips when the letter claims to be the production owner", () => {
    const letter = "I was the production owner of Horizon's live forecasting service.";
    const guards = heuristicGuards(letter, cv);
    expect(guards.fake_production.noul).toBeGreaterThanOrEqual(0.8);
  });
});
