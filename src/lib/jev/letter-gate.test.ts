import { describe, expect, it } from "vitest";
import { templateCoverLetter } from "@/lib/cover-letter";
import { checkCoverLetter } from "./check-letter";
import { SAMPLE_BULLETS, SAMPLE_CONSTRAINTS, SAMPLE_GOALS, SAMPLE_POSTINGS, SAMPLE_WEIGHTS } from "@/lib/seed/fixtures";
import type { Opportunity, Profile } from "./types";

describe("template cover letter gate", () => {
  it("passes citation and guard checks for a high-fit posting", async () => {
    const posting = SAMPLE_POSTINGS.find((p) => p.id === "job-horizon")!;
    const profile: Profile = {
      id: "default",
      goals: SAMPLE_GOALS,
      constraints: SAMPLE_CONSTRAINTS,
      weights: SAMPLE_WEIGHTS,
      bullets: SAMPLE_BULLETS,
      updatedAt: "",
    };
    const opportunity = { ...posting, status: "inbox", createdAt: "" } as Opportunity;
    const draft = templateCoverLetter(profile, opportunity);
    const check = await checkCoverLetter({ body: draft.body, claims: draft.claims, profile });
    expect(check.blockers).toEqual([]);
    expect(check.ready).toBe(true);
  });
});
