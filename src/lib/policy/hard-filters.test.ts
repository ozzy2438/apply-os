import { describe, expect, it } from "vitest";
import { runHardFilters } from "./hard-filters";
import { DEFAULT_CANDIDATE_PROFILE } from "@/lib/domain/defaults";
import { normalizeJobPosting } from "@/lib/ingest/normalize";

function job(raw: string, id = "j1") {
  return normalizeJobPosting({ id, rawText: raw, sourceType: "job_posting" });
}

describe("hard filters", () => {
  it("blocks US-only onsite when the candidate is AU-authorized", () => {
    const posting = job(`Title: Machine Learning Engineer
Company: Helio
Location: Onsite in New York
Must be a US citizen or green card holder. No visa sponsorship.`);
    const result = runHardFilters({ job: posting, profile: DEFAULT_CANDIDATE_PROFILE, duplicateStatus: "UNIQUE" });
    expect(result.workAuthorizationCompatible).toBe(false);
    expect(result.hardBlockers.join(" ")).toMatch(/authorization|red flag|Location|Workplace/i);
  });

  it("blocks pay clearly below the floor", () => {
    const posting = job(`Title: Data Scientist
Company: Little Leaf
Location: Remote Australia
Salary: AUD $70,000
Must have right to work in Australia.`);
    const result = runHardFilters({ job: posting, profile: DEFAULT_CANDIDATE_PROFILE, duplicateStatus: "UNIQUE" });
    expect(result.salaryCompatible).toBe(false);
    expect(result.hardBlockers.some((b) => /pay/i.test(b))).toBe(true);
  });

  it("blocks excluded graduate titles", () => {
    const posting = job(`Title: Graduate Data Scientist
Company: Riverbank
Location: Melbourne
Salary: AUD $85,000`);
    const result = runHardFilters({ job: posting, profile: DEFAULT_CANDIDATE_PROFILE, duplicateStatus: "UNIQUE" });
    expect(result.roleNotExcluded).toBe(false);
  });

  it("treats missing salary as unknown, not a hard fail", () => {
    const posting = job(`Title: Data Scientist
Company: Mystery
Location: Melbourne hybrid
Right to work in Australia.`);
    const result = runHardFilters({ job: posting, profile: DEFAULT_CANDIDATE_PROFILE, duplicateStatus: "UNIQUE" });
    expect(result.salaryCompatible).toBeNull();
    expect(result.hardBlockers.some((b) => /pay/i.test(b))).toBe(false);
  });

  it("blocks exact duplicates", () => {
    const posting = job(`Title: Data Scientist
Company: Horizon
Location: Melbourne`);
    const result = runHardFilters({ job: posting, profile: DEFAULT_CANDIDATE_PROFILE, duplicateStatus: "DUPLICATE" });
    expect(result.hardBlockers.join(" ")).toMatch(/duplicate/i);
  });
});
