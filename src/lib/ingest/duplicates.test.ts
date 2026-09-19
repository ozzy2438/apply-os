import { describe, expect, it } from "vitest";
import { classifyDuplicate } from "./duplicates";
import { normalizeJobPosting } from "./normalize";

describe("duplicates", () => {
  it("detects same URL as duplicate and similar title+company as possible", () => {
    const a = normalizeJobPosting({
      id: "a",
      url: "https://example.com/job/1",
      rawText: "Title: Data Scientist\nCompany: Horizon\nLocation: Melbourne\nPython SQL forecasting",
    });
    const b = normalizeJobPosting({
      id: "b",
      url: "https://example.com/job/1",
      rawText: "Title: Data Scientist\nCompany: Horizon\nLocation: Melbourne\nDifferent body",
    });
    expect(classifyDuplicate(b, [a])).toBe("DUPLICATE");
    const c = normalizeJobPosting({
      id: "c",
      url: "https://example.com/job/2",
      rawText: "Title: Data Scientist\nCompany: Horizon\nLocation: Sydney\nOther text entirely about warehouses",
    });
    expect(classifyDuplicate(c, [a])).toBe("POSSIBLE_DUPLICATE");
  });
});
