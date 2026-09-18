import { describe, expect, it } from "vitest";
import { parsePosting } from "./parse";

describe("parsePosting", () => {
  it("reads labelled fields", () => {
    const parsed = parsePosting(
      `Title: Data Scientist
Company: Horizon Retail AU
Location: Melbourne, VIC
Salary: AUD $140,000
Body goes here.`,
      "job_posting",
    );
    expect(parsed.title).toBe("Data Scientist");
    expect(parsed.company).toBe("Horizon Retail AU");
    expect(parsed.location).toContain("Melbourne");
    expect(parsed.compensation).toMatch(/140/);
  });
});
