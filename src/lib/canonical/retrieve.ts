import type { JobPosting } from "@/lib/domain/schemas";
import { isApplicationExcludedProject } from "./claims";
import type { CanonicalEvidence, CanonicalProfile, CanonicalProject } from "./types";

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

const STOP = new Set([
  "the", "and", "for", "with", "you", "will", "our", "are", "this", "that", "from", "job",
  "role", "team", "work", "your", "have", "must", "plus", "not", "any", "all", "can",
]);

function projectBlob(project: CanonicalProject): string {
  return [
    project.name,
    project.domains.join(" "),
    project.technologies.join(" "),
    project.keywords.join(" "),
    project.role_families_supported.join(" "),
    (project.role_family_ids ?? []).join(" "),
  ].join(" ");
}

export function detectRoleFamilyIds(job: JobPosting, profile: CanonicalProfile): string[] {
  const title = job.title.toLowerCase();
  const hits: string[] = [];
  for (const rt of profile.role_targets) {
    if (rt.acceptable_titles.some((t) => title.includes(t.toLowerCase()) || t.toLowerCase().includes(title))) {
      hits.push(rt.role_family_id);
      continue;
    }
    const family = rt.role_family.toLowerCase();
    if (title.includes(family.split(" / ")[0] ?? family)) hits.push(rt.role_family_id);
  }
  return [...new Set(hits)];
}

export function jobHasPlausibleRoleRelevance(job: JobPosting, profile: CanonicalProfile): boolean {
  if (detectRoleFamilyIds(job, profile).length) return true;
  return /\b(data|mlops|machine learning|ml engineer|ai engineer|analytics|business intelligence|\bbi\b|scientist|governance)\b/i.test(
    job.title,
  );
}

export function retrieveRelevantEvidence(
  job: JobPosting,
  profile: CanonicalProfile,
  limit = 24,
): { projects: CanonicalProject[]; evidence: CanonicalEvidence[] } {
  const hay = tokens(
    [job.title, job.company ?? "", job.requiredSkills.join(" "), job.preferredSkills.join(" "), job.descriptionRaw]
      .join(" ")
      .slice(0, 8000),
  );
  const families = new Set(detectRoleFamilyIds(job, profile));

  const ranked = profile.projects
    .filter((p) => !isApplicationExcludedProject(p.project_id) && p.cv_usage !== "excluded")
    .map((project) => {
      const blob = tokens(projectBlob(project));
      let score = 0;
      for (const t of blob) if (hay.has(t)) score += 1;
      if ((project.role_family_ids ?? []).some((id) => families.has(id))) score += 8;
      return { project, score };
    })
    .sort((a, b) => b.score - a.score);

  const projects = ranked.slice(0, 8).map((r) => r.project);
  const keep = new Set(projects.flatMap((p) => p.evidence_ids));

  const skillHits = profile.skills.filter((s) => {
    const names = [s.name, ...(s.aliases ?? [])].map((n) => n.toLowerCase());
    return names.some((n) => n.split(/\s+/).every((part) => hay.has(part) || job.descriptionRaw.toLowerCase().includes(n)));
  });
  for (const skill of skillHits.slice(0, 12)) {
    for (const id of skill.evidence_ids) keep.add(id);
  }

  const evidence = profile.evidence
    .filter((e) => keep.has(e.evidence_id))
    .filter((e) => !(e.subject.type === "project" && isApplicationExcludedProject(e.subject.id)))
    .slice(0, limit);

  return { projects, evidence };
}
