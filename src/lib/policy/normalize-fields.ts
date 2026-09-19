import type { EmploymentType, SeniorityLevel, WorkplaceType } from "@/lib/domain/enums";

const SKILL_CATALOG = [
  "python",
  "sql",
  "typescript",
  "javascript",
  "react",
  "next.js",
  "fastapi",
  "airflow",
  "lightgbm",
  "dbt",
  "mlflow",
  "aws",
  "gcp",
  "azure",
  "forecasting",
  "llm",
  "genai",
  "postgres",
];

export function detectWorkplace(text: string): WorkplaceType {
  const t = text.toLowerCase();
  if (/\bhybrid\b/.test(t)) return "HYBRID";
  if (/\bremote\b/.test(t) && !/\bonsite-only overseas\b/.test(t)) return "REMOTE";
  if (/\b(onsite|on-site|in[- ]office)\b/.test(t)) return "ONSITE";
  return "UNKNOWN";
}

export function detectEmployment(text: string): EmploymentType {
  const t = text.toLowerCase();
  if (/\bpart[- ]time\b/.test(t)) return "PART_TIME";
  if (/\bcasual\b/.test(t)) return "CASUAL";
  if (/\b(contract|contractor)\b/.test(t)) return "CONTRACT";
  if (/\b(full[- ]time|permanent)\b/.test(t)) return "FULL_TIME";
  return "UNKNOWN";
}

export function detectSeniority(title: string, body: string): SeniorityLevel {
  const t = `${title}\n${body}`.toLowerCase();
  const head = title.toLowerCase();
  if (/\b(graduate|intern|junior|entry)\b/.test(head)) return "JUNIOR";
  if (/\b(staff|principal|director|head of|lead)\b/.test(head)) return "LEAD";
  if (/\b(senior|mid\/senior|mid-senior)\b/.test(t)) return "SENIOR";
  if (/\bmid\b/.test(t)) return "MID";
  return "UNKNOWN";
}

export function detectCountry(location: string, body: string): string | null {
  const t = `${location}\n${body}`.toLowerCase();
  if (/\b(australia|melbourne|sydney|canberra|australian)\b/.test(t)) return "AU";
  if (/\b(united states|new york|san francisco|us citizen|green card)\b/.test(t)) return "US";
  if (/\b(united kingdom|london)\b/.test(t)) return "GB";
  return null;
}

export function extractSalaryBand(text: string): {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: "YEAR" | "DAY" | "HOUR" | null;
} {
  const currency = /\baud\b|\$/i.test(text) && /usd/i.test(text) ? "USD" : /\busd\b/i.test(text) ? "USD" : /aud|\$/i.test(text) ? "AUD" : null;
  const matches = [...text.matchAll(/\$?\s?(\d{2,3})\s?[,k]\s?000|\$(\d{2,3}),000|(\d{2,3})k\b/gi)];
  const values: number[] = [];
  for (const m of matches) {
    const n = Number(m[1] || m[2] || m[3]);
    if (!Number.isFinite(n)) continue;
    values.push(n < 1000 ? n * 1000 : n);
  }
  if (!values.length) return { min: null, max: null, currency, period: null };
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    currency: currency ?? "AUD",
    period: "YEAR",
  };
}

export function extractSkills(text: string): string[] {
  const t = text.toLowerCase();
  return SKILL_CATALOG.filter((skill) => t.includes(skill)).map((s) => (s === "next.js" ? "Next.js" : s === "sql" ? "SQL" : s[0].toUpperCase() + s.slice(1)));
}

export function extractVisaNotes(text: string): string[] {
  const t = text.toLowerCase();
  const notes: string[] = [];
  if (/right to work in australia|australian citizen|permanent resident/.test(t)) notes.push("AU work rights mentioned");
  if (/us citizen|green card|no visa sponsorship|united states only/.test(t)) notes.push("US-only / no sponsorship");
  if (/phd required|must have a phd/.test(t)) notes.push("PhD required");
  return notes;
}

export function looksClosed(text: string, deadline: Date | null, now = new Date()): boolean {
  const t = text.toLowerCase();
  if (/no longer accepting|position (has been )?filled|job closed|applications closed/.test(t)) return true;
  if (deadline && deadline.getTime() < now.getTime()) return true;
  return false;
}

export function parsePostedAt(text: string): string | null {
  const m = text.match(/posted\s*:?\s*(\d{4}-\d{2}-\d{2})/i);
  return m?.[1] ? new Date(m[1]).toISOString() : null;
}

export function parseDeadline(text: string): string | null {
  const m = text.match(/(?:deadline|closes)\s*:?\s*(\d{4}-\d{2}-\d{2})/i);
  return m?.[1] ? new Date(m[1]).toISOString() : null;
}
