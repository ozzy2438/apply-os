import { ageDays } from "./freshness";
import type { StoredDiscoveryItem } from "./persist";
import type { JobEvaluation } from "@/lib/domain/schemas";

export type DeskDiscoveryFacts = {
  live: boolean;
  mock: boolean;
  providers: string[];
  sourceUrls: string[];
  postedAt: string | null;
  discoveredAt: string | null;
  ageDays: number | null;
  triage: string | null;
  stage: string;
  roleFit: number | null;
  evidenceCoverage: number | null;
  decision: string | null;
  gaps: string[];
  why: string[];
};

export function deskDiscoveryFacts(
  item: StoredDiscoveryItem | null,
  evaluation: JobEvaluation | null,
  now = new Date(),
): DeskDiscoveryFacts | null {
  if (!item && !evaluation) return null;
  const normalized = item?.normalized ?? {};
  const postedAt = typeof normalized.postedAt === "string" ? normalized.postedAt : null;
  const discoveredAt = typeof normalized.discoveredAt === "string" ? normalized.discoveredAt : item?.createdAt ?? null;
  const reasons = (evaluation?.explanationReasons ?? []).slice(0, 4);
  const gaps = reasons.filter((r) => /missing|gap|uncertain|review/i.test(r)).slice(0, 3);
  const why: string[] = [];
  if (item && !item.live) why.push("MOCK discovery result — not a live search hit.");
  if (item?.live) why.push(`Live discovery via ${item.providerId}.`);
  if (item?.providerId) why.push(`Provider provenance: ${item.providerId}.`);
  if (postedAt) {
    const age = ageDays(postedAt, now);
    if (age != null) why.push(`Posted ${Math.max(0, Math.round(age))}d ago (freshness window applies before review).`);
  }
  if (item?.triageBucket) why.push(`Canonical triage: ${item.triageBucket}.`);
  if (evaluation?.roleFit != null) {
    why.push(`Role Fit ${Math.round(evaluation.roleFit * 100)} — this is not a hiring probability.`);
  }
  if (evaluation?.evidenceCoverage != null) {
    why.push(`Evidence coverage ${Math.round(evaluation.evidenceCoverage * 100)}.`);
  }
  if (evaluation?.finalDecision) why.push(`Decision state: ${evaluation.finalDecision}.`);
  if (gaps.length) why.push(`Important gaps: ${gaps.join(" ")}`);
  if (!why.length && reasons.length) why.push(reasons[0]!);

  return {
    live: Boolean(item?.live),
    mock: Boolean(item && !item.live),
    providers: item?.providerId ? item.providerId.split(",").filter(Boolean) : [],
    sourceUrls: item?.sourceUrls ?? [],
    postedAt,
    discoveredAt,
    ageDays: ageDays(postedAt, now),
    triage: item?.triageBucket ?? evaluation?.triage ?? null,
    stage: item?.stage ?? "TRIAGED",
    roleFit: evaluation?.roleFit ?? null,
    evidenceCoverage: evaluation?.evidenceCoverage ?? null,
    decision: evaluation?.finalDecision ?? null,
    gaps,
    why,
  };
}
