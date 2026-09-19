import { actionCompatible } from "./action-space";
import { actionRisk, isPermittedRisk } from "./risk";
import { isStaleDecision } from "./stale";
import { verifyPostcondition } from "./postcondition";
import { applyDemoAction, type DemoPage, observeDemoPage } from "./demo-board";
import type { BrowserAction, BrowserActionDecision, BrowserObservation, BrowserTask } from "./types";

export type ExecuteResult = {
  status: "executed" | "blocked" | "stale" | "incompatible" | "failed";
  reason: string;
  after?: BrowserObservation;
  importedJobId?: string;
  page?: DemoPage;
};

export function executeBrowserDecision(input: {
  decision: BrowserActionDecision;
  observation: BrowserObservation;
  task: BrowserTask;
  page: DemoPage;
  approvalToken: boolean;
}): ExecuteResult {
  if (isStaleDecision(input.decision, input.observation)) {
    return { status: "stale", reason: "Observation version changed. Decision discarded." };
  }
  const action = input.decision.action;
  if (!actionCompatible(action, input.observation)) {
    return { status: "incompatible", reason: "Action is not compatible with the current observation." };
  }
  const risk = actionRisk(action, input.observation.elements);
  if (!isPermittedRisk(risk, { sessionOptInMedium: input.task.sessionOptInMedium, approvalToken: input.approvalToken })) {
    return { status: "blocked", reason: `Risk ${risk} requires approval.` };
  }
  if (action.kind === "STOP") {
    return { status: "executed", reason: action.reason, page: input.page, after: input.observation };
  }
  if (action.kind === "REQUEST_USER_APPROVAL") {
    return { status: "blocked", reason: action.reason, page: input.page };
  }

  const applied = applyDemoAction(input.page, action);
  if (applied.blocked) {
    return { status: "blocked", reason: applied.blocked, page: input.page };
  }

  const after = observeDemoPage({
    sessionId: input.observation.sessionId,
    task: input.task,
    step: input.observation.step + 1,
    page: applied.page,
    recentActions: [
      {
        action: action.kind,
        targetId: "targetId" in action ? action.targetId : undefined,
        result: applied.importedJobId ? `imported:${applied.importedJobId}` : "ok",
        createdAt: new Date().toISOString(),
      },
      ...input.observation.recentActions,
    ].slice(0, 8),
  });

  const post = verifyPostcondition({ action, before: input.observation, after });
  if (!post.ok && action.kind !== "CLICK") {
    return { status: "failed", reason: post.detail, after, page: applied.page };
  }
  return {
    status: "executed",
    reason: post.detail,
    after,
    importedJobId: applied.importedJobId,
    page: applied.page,
  };
}

export function typeTextPolicy(text: string): { ok: boolean; reason?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "Empty text." };
  if (trimmed.length > 120) return { ok: false, reason: "Query exceeds max length." };
  if (/\b(password|ssn|credit card|bsb|account number)\b/i.test(trimmed)) {
    return { ok: false, reason: "Sensitive content is not allowed in typed text." };
  }
  return { ok: true };
}

export function bindTypedAction(action: BrowserAction, text: string): BrowserAction {
  if (action.kind !== "TYPE_TEXT") return action;
  return { ...action, expectedPostcondition: `Field equals “${text}”` };
}
