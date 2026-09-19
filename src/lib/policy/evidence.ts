import type { CandidateEvidence, CandidateProfile, JobPosting } from "@/lib/domain/schemas";

export function evidenceReadiness(job: JobPosting, evidence: CandidateEvidence[], profile: CandidateProfile): number {
  const verified = evidence.filter((e) => e.verified);
  if (!verified.length) return 0;
  const hay = verified.map((e) => `${e.claim} ${e.sourceText} ${e.skills.join(" ")}`.toLowerCase()).join("\n");
  const required = profile.requiredSkills.length ? profile.requiredSkills : job.requiredSkills;
  if (!required.length) return Math.min(1, verified.length / 3);
  const hits = required.filter((skill) => hay.includes(skill.toLowerCase())).length;
  return hits / required.length;
}

export function evidenceFromBullets(
  bullets: Array<{ id: string; text: string; kind: string }>,
): CandidateEvidence[] {
  return bullets.map((b) => ({
    id: `ev-${b.id}`,
    candidateProfileId: "default",
    type: b.kind === "learning" ? "SKILL" : "PROJECT",
    claim: b.text.split(".")[0]?.trim() || b.text,
    sourceReference: b.id,
    sourceText: b.text,
    skills: [],
    domains: [],
    yearsOfExperience: null,
    verified: true,
    verificationMethod: "CV_EXTRACTED" as const,
  }));
}
