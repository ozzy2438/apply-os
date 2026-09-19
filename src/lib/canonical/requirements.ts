import type { JobPosting } from "@/lib/domain/schemas";
import type { CanonicalEvidence, CanonicalProfile, CanonicalProject, EvidenceMatch, JobRequirement } from "./types";

function importanceFor(text: string, fallback: JobRequirement["importance"]): JobRequirement["importance"] {
  const t = text.toLowerCase();
  if (/\b(must|required|essential|mandatory|non-negotiable)\b/.test(t)) return "MUST";
  if (/\b(nice to have|nice-to-have|bonus|preferred|plus)\b/.test(t)) return "NICE";
  if (/\b(should|ideally|strong)\b/.test(t)) return "SHOULD";
  return fallback;
}

export function extractJobRequirements(job: JobPosting): JobRequirement[] {
  const out: JobRequirement[] = [];
  const push = (text: string, category: string, fallback: JobRequirement["importance"], span: string | null) => {
    const trimmed = text.trim();
    if (trimmed.length < 3) return;
    out.push({
      id: `req-${out.length + 1}`,
      text: trimmed,
      category,
      importance: importanceFor(trimmed, fallback),
      sourceSpan: span,
      extractionConfidence: span ? 0.85 : 0.6,
    });
  };

  for (const skill of job.requiredSkills) push(skill, "skill", "MUST", "requiredSkills");
  for (const skill of job.preferredSkills) push(skill, "skill", "NICE", "preferredSkills");
  for (const line of job.responsibilities) push(line, "responsibility", "SHOULD", "responsibilities");

  const lines = job.descriptionRaw.split(/\n|•|\*/).map((s) => s.trim()).filter((s) => s.length > 12 && s.length < 240);
  for (const line of lines) {
    if (!/\b(must|required|experience|proficient|knowledge of)\b/i.test(line)) continue;
    if (out.some((r) => r.text.toLowerCase() === line.toLowerCase())) continue;
    push(line, "requirement", "SHOULD", "descriptionRaw");
    if (out.length >= 16) break;
  }
  return out.slice(0, 16);
}

function overlap(a: string, b: string): number {
  const left = new Set(a.toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 3));
  let n = 0;
  for (const w of left) if (b.toLowerCase().includes(w)) n += 1;
  return n;
}

export function matchRequirementsToEvidence(input: {
  requirements: JobRequirement[];
  evidence: CanonicalEvidence[];
  projects: CanonicalProject[];
  profile: CanonicalProfile;
}): EvidenceMatch[] {
  return input.requirements.map((req) => {
    const scored = input.evidence
      .map((ev) => ({ ev, n: overlap(req.text, `${ev.claim} ${ev.source_text}`) }))
      .filter((row) => row.n >= 1)
      .sort((a, b) => b.n - a.n);
    const evidenceIds = scored.slice(0, 4).map((r) => r.ev.evidence_id);
    const projectIds = [
      ...new Set(
        scored
          .slice(0, 4)
          .map((r) => (r.ev.subject.type === "project" ? r.ev.subject.id : null))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const best = scored[0]?.n ?? 0;
    const support =
      best >= 3 ? "SUPPORTED" : best === 2 ? "PARTIAL" : best === 1 ? "PARTIAL" : req.importance === "NICE" ? "UNKNOWN" : "UNSUPPORTED";
    return {
      requirementId: req.id,
      evidenceIds,
      projectIds,
      support,
      confidence: Math.min(0.95, 0.35 + best * 0.15),
    };
  });
}

export function evidenceCoverage(matches: EvidenceMatch[]): number {
  if (!matches.length) return 0;
  const weights = { SUPPORTED: 1, PARTIAL: 0.5, UNKNOWN: 0.25, UNSUPPORTED: 0 };
  const sum = matches.reduce((n, m) => n + weights[m.support], 0);
  return sum / matches.length;
}
