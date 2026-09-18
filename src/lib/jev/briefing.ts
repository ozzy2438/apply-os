import { melbourneDate } from "@/lib/time";
import type { Opportunity, StoredEvaluation } from "./types";

export type RankedItem = {
  opportunity: Opportunity;
  composed: StoredEvaluation["composed"];
};

const CLOSED = new Set(["applied", "interview", "offer", "rejected", "skipped"]);

export function selectMorningDesk(items: RankedItem[], takeMax = 5): RankedItem[] {
  const eligible = items.filter(
    (item) => item.composed.deskEligible && !CLOSED.has(item.opportunity.status),
  );
  return [...eligible]
    .sort((a, b) => b.composed.rankingScore - a.composed.rankingScore)
    .slice(0, takeMax);
}

export function briefingDate(now = new Date()): string {
  return melbourneDate(now);
}
