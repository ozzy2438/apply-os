import { foldText } from "./normalize";
import type { NormalizedDiscoveryJob, SearchQuery } from "./types";

export type CheapFilterDecision = "keep" | "drop_unusable" | "drop_avoid_title";

export function cheapFilterItem(
  job: NormalizedDiscoveryJob,
  queries: SearchQuery[],
  opts?: { dropUnusable?: boolean; avoidTitleDrop?: boolean },
): CheapFilterDecision {
  const dropUnusable = opts?.dropUnusable !== false;
  const avoidTitleDrop = opts?.avoidTitleDrop !== false;
  if (dropUnusable && !job.title && !job.sourceUrl) return "drop_unusable";
  if (dropUnusable && !job.title) return "drop_unusable";

  if (!avoidTitleDrop) return "keep";
  const title = foldText(job.title);
  if (!title) return "keep";

  const avoid = queries.flatMap((q) => q.avoidTitles.map(foldText)).filter(Boolean);
  const supported = queries.flatMap((q) => q.titles.map(foldText)).filter(Boolean);
  const hitsAvoid = avoid.some((needle) => needle.length > 3 && title.includes(needle));
  const hitsSupported = supported.some((needle) => needle.length > 3 && (title.includes(needle) || needle.includes(title)));
  if (hitsAvoid && !hitsSupported) return "drop_avoid_title";
  return "keep";
}
