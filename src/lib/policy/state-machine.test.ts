import { describe, expect, it } from "vitest";
import { canTransition, readyAllowed, submitAllowed } from "./state-machine";

describe("status machine", () => {
  it("allows evaluation routing and blocks archived exits", () => {
    expect(canTransition("EVALUATING", "APPLY_CANDIDATE")).toBe(true);
    expect(canTransition("READY", "APPLIED")).toBe(true);
    expect(canTransition("ARCHIVED", "APPLY_CANDIDATE")).toBe(false);
  });

  it("READY and SUBMIT require explicit gates", () => {
    expect(readyAllowed({ letterReady: false, userReviewed: true, documentsSelected: true, hasSubmitApproval: false })).toBe(false);
    expect(readyAllowed({ letterReady: true, userReviewed: true, documentsSelected: true, hasSubmitApproval: false })).toBe(true);
    expect(submitAllowed({ letterReady: true, userReviewed: true, documentsSelected: true, hasSubmitApproval: false })).toBe(false);
    expect(submitAllowed({ letterReady: true, userReviewed: true, documentsSelected: true, hasSubmitApproval: true })).toBe(true);
  });
});
