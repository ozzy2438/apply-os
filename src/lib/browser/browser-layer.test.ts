import { describe, expect, it } from "vitest";
import { buildActionSpace, actionCompatible } from "./action-space";
import { observeDemoPage, demoStartUrl } from "./demo-board";
import { executeBrowserDecision, typeTextPolicy } from "./executor";
import { isStaleDecision } from "./stale";
import { actionRisk, isPermittedRisk } from "./risk";
import { verifyPostcondition } from "./postcondition";
import type { BrowserTask } from "./types";

const task: BrowserTask = {
  kind: "READ_ONLY_DISCOVERY",
  goal: "import jobs",
  startUrl: demoStartUrl(),
  maxJobs: 5,
  allowPagination: true,
  importedJobIds: [],
  sessionOptInMedium: false,
};

describe("browser layer", () => {
  it("builds an indexed action space from visible elements only", () => {
    const observation = observeDemoPage({
      sessionId: "s1",
      task,
      step: 0,
      page: { kind: "results", page: 1 },
      recentActions: [],
    });
    const space = buildActionSpace(observation, task);
    expect(space.indexed.length).toBeGreaterThan(3);
    expect(space.flags.pageLooksLikeResults).toBe(true);
    expect(space.actions.some((a) => a.kind === "STOP")).toBe(true);
  });

  it("rejects stale decisions and incompatible targets", () => {
    const observation = observeDemoPage({
      sessionId: "s1",
      task,
      step: 0,
      page: { kind: "results", page: 1 },
      recentActions: [],
    });
    expect(
      isStaleDecision(
        { observationVersion: "nope", action: { kind: "STOP", reason: "x" }, confidence: 1, rationaleCode: "TASK_COMPLETE" },
        observation,
      ),
    ).toBe(true);
    expect(
      actionCompatible({ kind: "CLICK", targetId: "missing", expectedPostcondition: "x" }, observation),
    ).toBe(false);
  });

  it("blocks irreversible apply without an approval token", () => {
    const observation = observeDemoPage({
      sessionId: "s1",
      task,
      step: 1,
      page: { kind: "detail", jobId: "job-horizon" },
      recentActions: [],
    });
    const apply = observation.elements.find((e) => e.metadata.isSubmissionControl)!;
    const risk = actionRisk({ kind: "CLICK", targetId: apply.id, expectedPostcondition: "submitted" }, observation.elements);
    expect(risk).toBe("IRREVERSIBLE");
    expect(isPermittedRisk(risk, { sessionOptInMedium: true, approvalToken: false })).toBe(false);

    const result = executeBrowserDecision({
      decision: {
        observationVersion: observation.page.observationVersion,
        action: { kind: "CLICK", targetId: apply.id, expectedPostcondition: "no submit" },
        confidence: 0.4,
        rationaleCode: "NEEDS_APPROVAL",
      },
      observation,
      task,
      page: { kind: "detail", jobId: "job-horizon" },
      approvalToken: false,
    });
    expect(result.status).toBe("blocked");
  });

  it("executes a low-risk open-detail click and verifies a postcondition", () => {
    const before = observeDemoPage({
      sessionId: "s1",
      task,
      step: 0,
      page: { kind: "results", page: 1 },
      recentActions: [],
    });
    const result = executeBrowserDecision({
      decision: {
        observationVersion: before.page.observationVersion,
        action: {
          kind: "CLICK",
          targetId: "el-job-job-horizon",
          expectedPostcondition: "detail opens",
          rationaleHint: "OPEN_JOB_DETAIL",
        },
        confidence: 0.84,
        rationaleCode: "OPEN_JOB_DETAIL",
      },
      observation: before,
      task,
      page: { kind: "results", page: 1 },
      approvalToken: false,
    });
    expect(result.status).toBe("executed");
    expect(result.after).toBeTruthy();
    const post = verifyPostcondition({
      action: { kind: "CLICK", targetId: "el-job-job-horizon", expectedPostcondition: "detail" },
      before,
      after: result.after!,
    });
    expect(post.ok).toBe(true);
  });

  it("rejects sensitive typed text", () => {
    expect(typeTextPolicy("password hunter2").ok).toBe(false);
    expect(typeTextPolicy("data scientist melbourne").ok).toBe(true);
  });
});
