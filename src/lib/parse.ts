import type { SourceType } from "@/lib/jev/types";

export type ParsedPosting = {
  sourceType: SourceType;
  title: string;
  company: string;
  location: string;
  compensation: string | null;
  url: string | null;
  rawText: string;
};

function firstMatch(text: string, pattern: RegExp): string | null {
  const m = text.match(pattern);
  return m?.[1]?.trim() || null;
}

export function parsePosting(rawText: string, sourceType: SourceType, url: string | null = null): ParsedPosting {
  const text = rawText.trim();
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const title =
    firstMatch(text, /(?:title|role)\s*[:\-]\s*(.+)/i) ||
    lines[0]?.slice(0, 120) ||
    (sourceType === "recruiter_inbound" ? "Recruiter inbound" : "Untitled posting");
  const company =
    firstMatch(text, /(?:company|organisation|organization|employer)\s*[:\-]\s*(.+)/i) ||
    firstMatch(text, /at\s+([A-Z][\w&.\- ]{2,40})/) ||
    lines[1]?.slice(0, 80) ||
    "Unknown company";
  const location =
    firstMatch(text, /(?:location|based in)\s*[:\-]\s*(.+)/i) ||
    firstMatch(text, /(Melbourne|Sydney|Remote|New York|London|San Francisco)[^.\n]*/i) ||
    "Unspecified";
  const compensation =
    firstMatch(text, /(?:salary|compensation|remuneration|pay)\s*[:\-]\s*(.+)/i) ||
    firstMatch(text, /(\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?(?:\s*(?:AUD|USD|k))?)/i);

  return {
    sourceType,
    title,
    company,
    location,
    compensation,
    url,
    rawText: text,
  };
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
