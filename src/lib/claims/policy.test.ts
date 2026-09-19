import { describe, expect, it } from "vitest";
import { claimExplanation, letterReadyFromClaims } from "./policy";

describe("claim verification policy", () => {
  it("blocks Ready on unsupported claims and explains from structure", () => {
    const blocked = letterReadyFromClaims(
      [
        {
          status: "UNSUPPORTED",
          confidence: 0.9,
          matchingEvidenceIds: [],
          requiredAction: "BLOCK",
        },
      ],
      true,
    );
    expect(blocked.ready).toBe(false);
    expect(
      claimExplanation({
        text: "led a production ML deployment",
        decision: blocked && {
          status: "UNSUPPORTED",
          confidence: 0.9,
          matchingEvidenceIds: [],
          requiredAction: "BLOCK",
        },
        evidenceLabels: [],
      }),
    ).toMatch(/no verified evidence/i);
  });

  it("allows only when every claim is supported", () => {
    const ok = letterReadyFromClaims(
      [
        {
          status: "SUPPORTED",
          confidence: 0.91,
          matchingEvidenceIds: ["ev-1"],
          requiredAction: "ALLOW",
        },
      ],
      true,
    );
    expect(ok.ready).toBe(true);
  });
});
