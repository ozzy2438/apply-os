import { describe, expect, it } from "vitest";
import { normalizeJobPosting } from "./normalize";

describe("normalizeJobPosting", () => {
  it("extracts workplace, salary, country, and keeps raw text", () => {
    const job = normalizeJobPosting({
      id: "n1",
      url: "https://www.seek.com.au/job/1",
      rawText: `Title: Senior Frontend Engineer
Company: Example
Location: Melbourne, VIC (hybrid)
Salary: AUD $140,000
Posted: 2026-09-01
Must have right to work in Australia. React TypeScript.`,
    });
    expect(job.source).toBe("SEEK");
    expect(job.workplaceType).toBe("HYBRID");
    expect(job.country).toBe("AU");
    expect(job.salaryMax).toBe(140000);
    expect(job.descriptionRaw).toContain("Senior Frontend Engineer");
    expect(job.extractionConfidence).toBeGreaterThan(0.5);
  });

  it("does not invent certainty on a vague recruiter note", () => {
    const job = normalizeJobPosting({
      id: "n2",
      sourceType: "recruiter_inbound",
      rawText: "Hi, exciting data opportunity. Competitive salary. NDA first.",
    });
    expect(job.salaryMax).toBeNull();
    expect(job.extractionConfidence).toBeLessThan(0.5);
  });
});
