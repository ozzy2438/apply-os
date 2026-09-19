import { randomUUID } from "node:crypto";
import type { AtomicClaim } from "@/lib/domain/schemas";
import type { ClaimCategory } from "@/lib/domain/enums";

function categoryOf(sentence: string): ClaimCategory {
  const t = sentence.toLowerCase();
  if (/citizen|visa|work rights|green card|sponsorship/.test(t)) return "WORK_AUTHORIZATION";
  if (/phd|degree|bachelor|master|university/.test(t)) return "EDUCATION";
  if (/certified|certification/.test(t)) return "CERTIFICATION";
  if (/\d+\s*%|\d+\+|\$\d+/.test(t)) return "METRIC";
  if (/led|owned|managed|years/.test(t)) return "EXPERIENCE";
  if (/python|sql|react|forecast|airflow|lightgbm/.test(t)) return "SKILL";
  if (/built|designed|shipped|created/.test(t)) return "ACHIEVEMENT";
  return "OTHER";
}

function entities(sentence: string): string[] {
  return sentence
    .split(/\W+/)
    .filter((w) => w.length > 3 && /^[A-Z]/.test(w))
    .slice(0, 8);
}

export function extractAtomicClaims(body: string, seeded?: Array<{ claim: string }>): AtomicClaim[] {
  const sentences = seeded?.length
    ? seeded.map((s) => s.claim)
    : body.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 20);
  const seen = new Set<string>();
  const out: AtomicClaim[] = [];
  for (const sentence of sentences) {
    const text = sentence.replace(/^\d+\.\s*/, "").trim();
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    if (/hello |kind regards|i'm applying for|i am based|looking for work that matches|tone:/.test(key)) continue;
    if (/under-claim|every claim above|would rather/.test(key)) continue;
    seen.add(key);
    out.push({
      id: randomUUID(),
      text,
      claimCategory: categoryOf(text),
      extractedEntities: entities(text),
    });
  }
  return out.slice(0, 12);
}
