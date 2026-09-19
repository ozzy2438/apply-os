import type { BrowserAction, BrowserElement, RiskLevel } from "./types";

export function elementRisk(el: BrowserElement): RiskLevel {
  if (el.metadata.isPayment || el.metadata.isPassword) return "IRREVERSIBLE";
  if (el.metadata.isSubmissionControl) return "IRREVERSIBLE";
  if (el.metadata.isCaptcha) return "IRREVERSIBLE";
  const name = el.name.toLowerCase();
  if (/\b(submit|send|apply now|easy apply|purchase|pay|accept terms|i agree|upload|attach)\b/.test(name)) {
    return "IRREVERSIBLE";
  }
  if (/\b(message|inmail|cover letter|resume|cv)\b/.test(name) && el.role !== "link") return "HIGH";
  if (el.metadata.isExternalNavigation) return "MEDIUM";
  if (el.role === "textbox" && /search|filter/.test(name)) return "MEDIUM";
  if (el.role === "link" || el.role === "button") return "LOW";
  return "NONE";
}

export function actionRisk(action: BrowserAction, elements: BrowserElement[]): RiskLevel {
  if (action.kind === "STOP" || action.kind === "WAIT" || action.kind === "SCROLL" || action.kind === "GO_BACK") {
    return action.kind === "GO_BACK" ? "LOW" : "NONE";
  }
  if (action.kind === "REQUEST_USER_APPROVAL") return "HIGH";
  const targetId = "targetId" in action ? action.targetId : undefined;
  const el = elements.find((e) => e.id === targetId);
  return el ? elementRisk(el) : "HIGH";
}

export function requiresApproval(
  risk: RiskLevel,
  ctx: { sessionOptInMedium: boolean; approvalToken: boolean },
): boolean {
  if (risk === "NONE" || risk === "LOW") return false;
  if (risk === "MEDIUM") return !ctx.sessionOptInMedium;
  if (risk === "HIGH") return !ctx.approvalToken;
  return !ctx.approvalToken;
}

export function isPermittedRisk(risk: RiskLevel, ctx: { sessionOptInMedium: boolean; approvalToken: boolean }): boolean {
  return !requiresApproval(risk, ctx);
}
