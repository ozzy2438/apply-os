import { actionRisk, elementRisk } from "./risk";
import type { BrowserAction, BrowserActionSpace, BrowserElement, BrowserObservation, BrowserTask } from "./types";

const MAX_INDEXED = 12;

function allowedElement(el: BrowserElement): boolean {
  if (!el.visible || !el.enabled) return false;
  if (el.metadata.isPassword || el.metadata.isPayment || el.metadata.isCaptcha) return false;
  return true;
}

export function buildActionSpace(observation: BrowserObservation, task: BrowserTask): BrowserActionSpace {
  const elements = observation.elements.filter(allowedElement);
  const actions: BrowserAction[] = [];

  for (const el of elements) {
    if (el.supportedActions.includes("CLICK")) {
      const extract = Boolean(el.metadata.jobId && observation.page.url.includes("/jobs/"));
      const results = Boolean(el.metadata.jobId && observation.page.url.includes("/results"));
      const paginate = /next page|next/i.test(el.name) && el.role === "button";
      actions.push({
        kind: "CLICK",
        targetId: el.id,
        expectedPostcondition: extract
          ? "Job fields remain visible for extraction"
          : paginate
            ? "First visible job id changes"
            : "Job detail heading or URL changes",
        rationaleHint: extract ? "EXTRACT_JOB" : paginate ? "CONTINUE_PAGINATION" : results ? "OPEN_JOB_DETAIL" : "DISCOVER_JOB",
      });
    }
    if (el.supportedActions.includes("TYPE_TEXT") && elementRisk(el) !== "IRREVERSIBLE") {
      actions.push({
        kind: "TYPE_TEXT",
        targetId: el.id,
        expectedPostcondition: "Field value equals the approved query",
        rationaleHint: "DISCOVER_JOB",
      });
    }
  }

  actions.push({
    kind: "SCROLL",
    direction: "DOWN",
    amount: "MEDIUM",
    expectedPostcondition: "Additional job cards or text become visible",
  });
  actions.push({ kind: "GO_BACK", expectedPostcondition: "URL returns to the previous page" });
  actions.push({ kind: "WAIT", milliseconds: 400, expectedPostcondition: "Loading state ends" });
  actions.push({ kind: "STOP", reason: "User or policy stopped the session" });
  actions.push({
    kind: "REQUEST_USER_APPROVAL",
    reason: "Next step may have external side effects",
    proposedAction: "Open application page or save on an external site",
  });

  if (!task.allowPagination) {
    for (let i = actions.length - 1; i >= 0; i -= 1) {
      const a = actions[i];
      if (a.kind === "CLICK" && a.rationaleHint === "CONTINUE_PAGINATION") actions.splice(i, 1);
    }
  }

  const indexed = actions.slice(0, MAX_INDEXED).map((action, index) => {
    const el = "targetId" in action ? elements.find((e) => e.id === action.targetId) : undefined;
    const label =
      action.kind === "CLICK" && el
        ? `${el.role}  ${el.name}`
        : action.kind === "TYPE_TEXT" && el
          ? `textbox  ${el.name}`
          : action.kind === "STOP"
            ? "stop session"
            : action.kind.toLowerCase();
    return { index: index + 1, label, action, risk: actionRisk(action, observation.elements) };
  });

  const text = observation.visibleTextSummary.toLowerCase();
  return {
    observationVersion: observation.page.observationVersion,
    actions,
    indexed,
    flags: {
      pageLooksLikeJobDetail: /must-haves|salary|responsib|about the role/.test(text) || observation.page.url.includes("/jobs/"),
      pageLooksLikeResults: observation.page.url.includes("/results") || /jobs found|search results/.test(text),
      hasCaptcha: observation.elements.some((e) => e.metadata.isCaptcha),
      hasLoginWall: /sign in to continue|log in to/.test(text),
    },
  };
}

export function findActionByIndex(space: BrowserActionSpace, index: number): BrowserAction | undefined {
  return space.indexed.find((row) => row.index === index)?.action;
}

export function actionCompatible(action: BrowserAction, observation: BrowserObservation): boolean {
  if (action.kind === "STOP" || action.kind === "WAIT" || action.kind === "SCROLL" || action.kind === "GO_BACK") return true;
  if (action.kind === "REQUEST_USER_APPROVAL") return true;
  if (!("targetId" in action)) return false;
  const el = observation.elements.find((e) => e.id === action.targetId);
  if (!el || !el.visible || !el.enabled) return false;
  if (action.kind === "CLICK") return el.supportedActions.includes("CLICK");
  if (action.kind === "TYPE_TEXT") return el.supportedActions.includes("TYPE_TEXT");
  if (action.kind === "SELECT_OPTION") {
    return el.supportedActions.includes("SELECT_OPTION") && (el.metadata.optionIds ?? []).includes(action.optionId);
  }
  return false;
}
