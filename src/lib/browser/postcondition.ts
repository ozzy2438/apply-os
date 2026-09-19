import type { BrowserAction, BrowserObservation } from "./types";

export function verifyPostcondition(input: {
  action: BrowserAction;
  before: BrowserObservation;
  after: BrowserObservation;
}): { ok: boolean; detail: string } {
  const { action, before, after } = input;
  if (action.kind === "STOP") return { ok: true, detail: "Stopped." };
  if (action.kind === "REQUEST_USER_APPROVAL") return { ok: true, detail: "Approval requested." };
  if (action.kind === "WAIT") return { ok: after.page.observationVersion !== before.page.observationVersion || after.step >= before.step, detail: "Wait completed." };
  if (action.kind === "SCROLL") {
    return { ok: after.visibleTextSummary.length >= before.visibleTextSummary.length, detail: "Scroll observed." };
  }
  if (action.kind === "GO_BACK") {
    return { ok: after.page.url !== before.page.url || after.page.title !== before.page.title, detail: "Back navigation." };
  }
  if (action.kind === "TYPE_TEXT") {
    const el = after.elements.find((e) => e.id === action.targetId);
    return { ok: Boolean(el && el.value && el.value.length > 0), detail: "Field value changed." };
  }
  if (action.kind === "CLICK") {
    const urlChanged = after.page.url !== before.page.url;
    const titleChanged = after.page.title !== before.page.title;
    const textChanged = after.visibleTextSummary !== before.visibleTextSummary;
    return { ok: urlChanged || titleChanged || textChanged, detail: "Click produced a visible change." };
  }
  if (action.kind === "SELECT_OPTION") {
    const el = after.elements.find((e) => e.id === action.targetId);
    return { ok: el?.value === action.optionId, detail: "Option selected." };
  }
  return { ok: false, detail: "Unknown action." };
}
