import type { Opportunity, Status } from "@/lib/jev/types";
import type { CanonicalStatus } from "./enums";
import type { JobPosting } from "./schemas";

const V1_TO_CANONICAL: Record<Status, CanonicalStatus> = {
  inbox: "APPLY_CANDIDATE",
  review: "REVIEW_REQUIRED",
  ready: "READY",
  applied: "APPLIED",
  interview: "INTERVIEW",
  offer: "CLOSED",
  rejected: "CLOSED",
  skipped: "SKIP",
};

const CANONICAL_TO_V1: Record<CanonicalStatus, Status> = {
  NEW: "inbox",
  EVALUATING: "inbox",
  APPLY_CANDIDATE: "inbox",
  REVIEW_REQUIRED: "review",
  SKIP: "skipped",
  SAVED: "inbox",
  READY: "ready",
  APPLIED: "applied",
  INTERVIEW: "interview",
  CLOSED: "rejected",
  ARCHIVED: "skipped",
};

export function toCanonicalStatus(status: Status): CanonicalStatus {
  return V1_TO_CANONICAL[status];
}

export function toV1Status(status: CanonicalStatus): Status {
  return CANONICAL_TO_V1[status];
}

export function sourceFromV1(sourceType: Opportunity["sourceType"], url: string | null): JobPosting["source"] {
  if (sourceType === "recruiter_inbound") return "OTHER";
  if (!url) return "MANUAL";
  const host = url.toLowerCase();
  if (host.includes("linkedin.")) return "LINKEDIN";
  if (host.includes("seek.")) return "SEEK";
  if (host.includes("indeed.")) return "INDEED";
  return "URL_IMPORT";
}
