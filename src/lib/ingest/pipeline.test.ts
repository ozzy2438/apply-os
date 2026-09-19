import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import { resetDriverForTests, sqliteDriver } from "@/lib/db/driver";
import { saveProfile } from "@/lib/db/store";
import { SAMPLE_BULLETS, SAMPLE_CONSTRAINTS, SAMPLE_GOALS, SAMPLE_POSTINGS, SAMPLE_WEIGHTS } from "@/lib/seed/fixtures";
import { replaceEvidence, saveCandidateRules } from "@/lib/db/store-extended";
import { DEFAULT_CANDIDATE_PROFILE } from "@/lib/domain/defaults";
import { evidenceFromBullets } from "@/lib/policy/evidence";
import { ingestCanonical } from "./pipeline";

describe("ingest pipeline", () => {
  afterEach(() => {
    resetDriverForTests(undefined);
  });

  it("pastes a job, normalizes, evaluates, and routes into inbox/review/skip", async () => {
    const file = path.join(os.tmpdir(), `apply-os-pipe-${Date.now()}.db`);
    resetDriverForTests(sqliteDriver(file));
    const profile = await saveProfile({
      goals: SAMPLE_GOALS,
      constraints: SAMPLE_CONSTRAINTS,
      weights: SAMPLE_WEIGHTS,
      bullets: SAMPLE_BULLETS,
    });
    await saveCandidateRules(DEFAULT_CANDIDATE_PROFILE);
    await replaceEvidence(evidenceFromBullets(SAMPLE_BULLETS));

    const seeded = SAMPLE_POSTINGS.find((p) => p.id === "job-horizon")!;
    const horizon = await ingestCanonical({
      rawText: seeded.rawText,
      sourceType: "job_posting",
      profile,
    });
    expect(horizon.evaluation.finalDecision).toBe("APPLY_CANDIDATE");
    expect(horizon.job.title).toMatch(/Data Scientist/);

    const nyc = await ingestCanonical({
      rawText: `Title: Machine Learning Engineer
Company: Helio Markets
Location: Onsite in New York
Must be a US citizen. No visa sponsorship.`,
      sourceType: "job_posting",
      profile,
    });
    expect(nyc.evaluation.finalDecision).toBe("SKIP");
    expect(nyc.evaluation.deterministicResults.hardBlockers.length).toBeGreaterThan(0);
  });
});
