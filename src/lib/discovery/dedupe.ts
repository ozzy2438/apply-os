import { sha256 } from "@/lib/domain/hash";
import { foldText } from "./normalize";
import type { DiscoveryCluster, NormalizedDiscoveryJob } from "./types";

function locationToken(location: string | null): string | null {
  if (!location) return null;
  const t = foldText(location);
  if (!t) return null;
  if (/\bmelbourne\b/.test(t)) return "melbourne";
  if (/\bsydney\b/.test(t)) return "sydney";
  if (/\bbrisbane\b/.test(t)) return "brisbane";
  if (/\bcanberra\b/.test(t)) return "canberra";
  if (/\bperth\b/.test(t)) return "perth";
  if (/\badelaide\b/.test(t)) return "adelaide";
  if (/\bremote\b/.test(t) && /\baustralia\b/.test(t)) return "remote-au";
  return t;
}

function identityKey(job: NormalizedDiscoveryJob): string | null {
  const company = foldText(job.company);
  const title = foldText(job.title);
  const location = locationToken(job.location);
  if (!company || !title || !location) return null;
  return `id:${company}|${title}|${location}`;
}

function hashKey(job: NormalizedDiscoveryJob): string | null {
  const company = foldText(job.company);
  if (!company || !job.contentHash) return null;
  return `hash:${company}|${job.contentHash}`;
}

function keysFor(job: NormalizedDiscoveryJob): string[] {
  const keys: string[] = [];
  if (job.canonicalUrl) keys.push(`url:${job.canonicalUrl}`);
  if (job.externalId) keys.push(`ext:${job.externalId}`);
  const ident = identityKey(job);
  if (ident) keys.push(ident);
  const hashed = hashKey(job);
  if (hashed) keys.push(hashed);
  return keys;
}

class UnionFind {
  private parent = new Map<number, number>();
  find(i: number): number {
    if (!this.parent.has(i)) this.parent.set(i, i);
    const p = this.parent.get(i)!;
    if (p !== i) this.parent.set(i, this.find(p));
    return this.parent.get(i)!;
  }
  union(a: number, b: number): void {
    const pa = this.find(a);
    const pb = this.find(b);
    if (pa !== pb) this.parent.set(pa, pb);
  }
}

function mergeJobs(members: NormalizedDiscoveryJob[]): NormalizedDiscoveryJob {
  const urls = [...new Set(members.map((m) => m.sourceUrl))];
  const provenance = members.flatMap((m) => m.provenance);
  const primary =
    members.find((m) => m.description && m.description.length >= 400) ??
    members.find((m) => m.description) ??
    members.find((m) => m.snippet) ??
    members[0]!;
  return {
    ...primary,
    live: members.some((m) => m.live),
    sourceUrl: primary.sourceUrl,
    canonicalUrl: primary.canonicalUrl ?? members.find((m) => m.canonicalUrl)?.canonicalUrl ?? null,
    title: primary.title ?? members.find((m) => m.title)?.title ?? null,
    company: primary.company ?? members.find((m) => m.company)?.company ?? null,
    location: primary.location ?? members.find((m) => m.location)?.location ?? null,
    workMode: primary.workMode ?? members.find((m) => m.workMode)?.workMode ?? null,
    employmentType: primary.employmentType ?? members.find((m) => m.employmentType)?.employmentType ?? null,
    salaryText: primary.salaryText ?? members.find((m) => m.salaryText)?.salaryText ?? null,
    postedAt: primary.postedAt ?? members.find((m) => m.postedAt)?.postedAt ?? null,
    snippet: primary.snippet ?? members.find((m) => m.snippet)?.snippet ?? null,
    description: primary.description ?? members.find((m) => m.description)?.description ?? null,
    hydrated: members.some((m) => m.hydrated),
    provenance,
    sourceUrls: urls,
  } as NormalizedDiscoveryJob;
}

export function clusterDiscoveryJobs(jobs: NormalizedDiscoveryJob[]): DiscoveryCluster[] {
  const uf = new UnionFind();
  const index = new Map<string, number>();
  jobs.forEach((_, i) => uf.find(i));
  jobs.forEach((job, i) => {
    for (const key of keysFor(job)) {
      const existing = index.get(key);
      if (existing != null) uf.union(existing, i);
      else index.set(key, i);
    }
  });

  const groups = new Map<number, NormalizedDiscoveryJob[]>();
  jobs.forEach((job, i) => {
    const root = uf.find(i);
    const list = groups.get(root) ?? [];
    list.push(job);
    groups.set(root, list);
  });

  return [...groups.values()].map((members) => {
    const merged = mergeJobs(members);
    const clusterId = `disc-${sha256(
      merged.canonicalUrl || identityKey(merged) || hashKey(merged) || merged.contentHash,
    ).slice(0, 16)}`;
    const sourceUrls = [...new Set(members.map((m) => m.sourceUrl))];
    return {
      clusterId,
      stage: "DEDUPED",
      live: members.some((m) => m.live),
      title: merged.title,
      company: merged.company,
      location: merged.location,
      canonicalUrl: merged.canonicalUrl,
      sourceUrls,
      providers: [...new Set(members.map((m) => m.providerId))],
      contentHash: merged.contentHash,
      postedAt: merged.postedAt,
      discoveredAt: merged.discoveredAt,
      snippet: merged.snippet,
      description: merged.description,
      hydrated: merged.hydrated,
      hydrateAttempted: false,
      triageBucket: null,
      triageReasons: [],
      opportunityId: null,
      jevRan: false,
      terminalReason: null,
      members,
      job: null,
    };
  });
}

export function clusterSourceUrls(cluster: DiscoveryCluster): string[] {
  return [...new Set([...cluster.sourceUrls, ...cluster.members.map((m) => m.sourceUrl)])];
}
