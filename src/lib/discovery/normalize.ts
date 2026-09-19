import { sha256 } from "@/lib/domain/hash";
import type { EmploymentType, WorkplaceType } from "@/lib/domain/enums";
import { nowIso } from "@/lib/time";
import type { NormalizedDiscoveryJob, RawDiscoveryItem, RawJobDocument, SearchQuery } from "./types";

const TRACKING = /^(utm_|fbclid|gclid|mc_|ref$|source$|li_fat_id)/i;

export function canonicalizeUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING.test(key)) parsed.searchParams.delete(key);
    }
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    const search = parsed.searchParams.toString();
    return `${parsed.protocol}//${parsed.hostname}${path}${search ? `?${search}` : ""}`;
  } catch {
    return null;
  }
}

export function extractPostingId(url: string | null): string | null {
  if (!url) return null;
  const greenhouse = url.match(/greenhouse\.io\/[^/]+\/jobs\/(\d+)/i);
  if (greenhouse?.[1]) return `greenhouse:${greenhouse[1]}`;
  const lever = url.match(/lever\.co\/[^/]+\/([a-f0-9-]{8,})/i);
  if (lever?.[1]) return `lever:${lever[1]}`;
  const ashby = url.match(/ashbyhq\.com\/[^/]+\/(?:jobs\/)?([a-z0-9-]+)/i);
  if (ashby?.[1]) return `ashby:${ashby[1]}`;
  const seek = url.match(/seek\.com\.au\/job\/(\d+)/i);
  if (seek?.[1]) return `seek:${seek[1]}`;
  return null;
}

export function foldText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contentFingerprint(input: {
  title: string | null;
  company: string | null;
  snippet: string | null;
  description: string | null;
}): string {
  const body = (input.description || input.snippet || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 800);
  return sha256([foldText(input.title), foldText(input.company), body].join("|"));
}

function detectWorkplace(text: string): WorkplaceType | null {
  const t = text.toLowerCase();
  if (!t.trim()) return null;
  if (/\bhybrid\b/.test(t)) return "HYBRID";
  if (/\bremote\b/.test(t)) return "REMOTE";
  if (/\b(onsite|on-site|in[- ]office)\b/.test(t)) return "ONSITE";
  return null;
}

function detectEmployment(text: string): EmploymentType | null {
  const t = text.toLowerCase();
  if (!t.trim()) return null;
  if (/\bpart[- ]time\b/.test(t)) return "PART_TIME";
  if (/\bcasual\b/.test(t)) return "CASUAL";
  if (/\b(contract|contractor)\b/.test(t)) return "CONTRACT";
  if (/\b(full[- ]time|permanent)\b/.test(t)) return "FULL_TIME";
  return null;
}

function salaryIfStated(text: string): string | null {
  const m = text.match(/(?:salary|compensation|remuneration|pay)\s*[:\-]\s*([^\n]+)/i) || text.match(/(\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?(?:\s*(?:AUD|USD|k))?)/i);
  return m?.[1]?.trim() || null;
}

export function rawTextFromNormalized(job: {
  title: string | null;
  company: string | null;
  location: string | null;
  workMode?: WorkplaceType | null;
  employmentType?: EmploymentType | null;
  salaryText?: string | null;
  postedAt?: string | null;
  snippet?: string | null;
  description?: string | null;
}): string {
  const lines: string[] = [];
  if (job.title) lines.push(`Title: ${job.title}`);
  if (job.company) lines.push(`Company: ${job.company}`);
  if (job.location) lines.push(`Location: ${job.location}`);
  if (job.workMode && job.workMode !== "UNKNOWN") lines.push(`Work mode: ${job.workMode}`);
  if (job.employmentType && job.employmentType !== "UNKNOWN") lines.push(`Employment: ${job.employmentType}`);
  if (job.salaryText) lines.push(`Salary: ${job.salaryText}`);
  if (job.postedAt) lines.push(`Posted: ${job.postedAt.slice(0, 10)}`);
  const body = job.description || job.snippet;
  if (body) lines.push("", body);
  return lines.join("\n");
}

export function normalizeDiscoveryItem(
  item: RawDiscoveryItem | RawJobDocument,
  query: SearchQuery | null,
  discoveredAt = nowIso(),
): NormalizedDiscoveryJob {
  const hydrated = "hydrated" in item ? Boolean(item.hydrated) : false;
  const description =
    "description" in item && typeof item.description === "string"
      ? item.description
      : typeof item.raw.description === "string"
        ? item.raw.description
        : null;
  const blob = [item.title, item.company, item.location, item.snippet, description].filter(Boolean).join("\n");
  const canonicalUrl = canonicalizeUrl(item.url);
  return {
    providerId: item.providerId,
    live: item.live,
    sourceUrl: item.url,
    canonicalUrl,
    externalId: item.externalId || extractPostingId(item.url) || extractPostingId(canonicalUrl),
    title: item.title?.trim() || null,
    company: item.company?.trim() || null,
    location: item.location?.trim() || null,
    workMode: detectWorkplace(blob),
    employmentType: detectEmployment(blob),
    salaryText: salaryIfStated(blob),
    postedAt: item.publishedAt,
    discoveredAt,
    snippet: item.snippet,
    description,
    hydrated,
    contentHash: contentFingerprint({
      title: item.title,
      company: item.company,
      snippet: item.snippet,
      description,
    }),
    provenance: [
      {
        providerId: item.providerId,
        sourceUrl: item.url,
        canonicalUrl,
        externalId: item.externalId ?? extractPostingId(item.url),
        discoveredAt,
        queryId: query?.id ?? null,
      },
    ],
    queryId: query?.id ?? null,
  };
}

export type ExaSearchHit = {
  id?: string;
  title?: string | null;
  url?: string | null;
  publishedDate?: string | null;
  author?: string | null;
  text?: string | null;
  highlights?: string[] | null;
  summary?: string | null;
};

export function normalizeExaResult(hit: ExaSearchHit, live: boolean): RawDiscoveryItem | null {
  const url = hit.url?.trim();
  if (!url) return null;
  const snippet = hit.highlights?.filter(Boolean).join(" ").trim() || hit.summary?.trim() || hit.text?.slice(0, 400) || null;
  return {
    providerId: "exa",
    live,
    url,
    title: hit.title?.trim() || null,
    company: hit.author?.trim() || null,
    location: null,
    snippet,
    publishedAt: hit.publishedDate ?? null,
    author: hit.author ?? null,
    externalId: hit.id ?? extractPostingId(url),
    raw: {
      id: hit.id ?? null,
      publishedDate: hit.publishedDate ?? null,
      hasText: Boolean(hit.text),
    },
  };
}
