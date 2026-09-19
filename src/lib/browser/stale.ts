import type { BrowserActionDecision, BrowserObservation } from "./types";

export function isStaleDecision(decision: BrowserActionDecision, current: BrowserObservation): boolean {
  return decision.observationVersion !== current.page.observationVersion;
}
