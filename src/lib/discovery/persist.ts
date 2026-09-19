import { getDriver } from "@/lib/db/driver";
import { nowIso } from "@/lib/time";
import type { DiscoveryRunResult } from "./types";

export type StoredDiscoveryRun = {
  id: string;
  configVersion: string;
  live: boolean;
  status: string;
  summary: Record<string, unknown>;
  candidateProfileVersion: string | null;
  decisionPolicyVersion: string | null;
  createdAt: string;
};

export type StoredDiscoveryItem = {
  id: string;
  runId: string;
  clusterId: string;
  opportunityId: string | null;
  stage: string;
  triageBucket: string | null;
  providerId: string;
  live: boolean;
  title: string | null;
  company: string | null;
  location: string | null;
  canonicalUrl: string | null;
  sourceUrls: string[];
  contentHash: string | null;
  normalized: Record<string, unknown>;
  provenance: unknown[];
  createdAt: string;
};

export async function saveDiscoveryRun(result: DiscoveryRunResult): Promise<void> {
  const db = getDriver();
  const createdAt = nowIso();
  await db.execute(
    `INSERT INTO discovery_runs
      (id, config_version, query_json, provider_ids_json, live, status, summary_json, candidate_profile_version, decision_policy_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      result.runId,
      result.configVersion,
      JSON.stringify(result.queries),
      JSON.stringify(result.providerIds),
      result.live ? 1 : 0,
      result.status,
      JSON.stringify({
        counts: result.counts,
        expensive: result.expensive,
        liveDiscovery: result.liveDiscovery,
        usedFixture: result.usedFixture,
        providerErrors: result.providerErrors,
      }),
      result.candidateProfileVersion,
      result.decisionPolicyVersion,
      createdAt,
    ],
  );
  for (const cluster of result.clusters) {
    await db.execute(
      `INSERT INTO discovery_items
        (id, run_id, cluster_id, opportunity_id, stage, triage_bucket, provider_id, live, title, company, location, canonical_url, source_urls_json, content_hash, normalized_json, provenance_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `${result.runId}:${cluster.clusterId}`,
        result.runId,
        cluster.clusterId,
        cluster.opportunityId,
        cluster.stage,
        cluster.triageBucket,
        cluster.providers.join(","),
        cluster.live ? 1 : 0,
        cluster.title,
        cluster.company,
        cluster.location,
        cluster.canonicalUrl,
        JSON.stringify(cluster.sourceUrls),
        cluster.contentHash,
        JSON.stringify({
          postedAt: cluster.postedAt,
          discoveredAt: cluster.discoveredAt,
          snippet: cluster.snippet,
          hydrated: cluster.hydrated,
          hydrateAttempted: cluster.hydrateAttempted,
          jevRan: cluster.jevRan,
          terminalReason: cluster.terminalReason,
          triageReasons: cluster.triageReasons,
        }),
        JSON.stringify(cluster.members.flatMap((m) => m.provenance)),
        createdAt,
      ],
    );
  }
}

export async function latestDiscoveryRun(): Promise<StoredDiscoveryRun | null> {
  const db = getDriver();
  const row = await db.get<{
    id: string;
    config_version: string;
    live: number | boolean;
    status: string;
    summary_json: string;
    candidate_profile_version: string | null;
    decision_policy_version: string | null;
    created_at: string;
  }>("SELECT * FROM discovery_runs ORDER BY created_at DESC LIMIT 1");
  if (!row) return null;
  return {
    id: row.id,
    configVersion: row.config_version,
    live: Boolean(row.live),
    status: row.status,
    summary: JSON.parse(row.summary_json) as Record<string, unknown>,
    candidateProfileVersion: row.candidate_profile_version,
    decisionPolicyVersion: row.decision_policy_version,
    createdAt: row.created_at,
  };
}

export async function listDiscoveryItems(runId: string): Promise<StoredDiscoveryItem[]> {
  const db = getDriver();
  const rows = await db.all<{
    id: string;
    run_id: string;
    cluster_id: string;
    opportunity_id: string | null;
    stage: string;
    triage_bucket: string | null;
    provider_id: string;
    live: number | boolean;
    title: string | null;
    company: string | null;
    location: string | null;
    canonical_url: string | null;
    source_urls_json: string;
    content_hash: string | null;
    normalized_json: string;
    provenance_json: string;
    created_at: string;
  }>("SELECT * FROM discovery_items WHERE run_id = ? ORDER BY created_at DESC", [runId]);
  return rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    clusterId: row.cluster_id,
    opportunityId: row.opportunity_id,
    stage: row.stage,
    triageBucket: row.triage_bucket,
    providerId: row.provider_id,
    live: Boolean(row.live),
    title: row.title,
    company: row.company,
    location: row.location,
    canonicalUrl: row.canonical_url,
    sourceUrls: JSON.parse(row.source_urls_json) as string[],
    contentHash: row.content_hash,
    normalized: JSON.parse(row.normalized_json) as Record<string, unknown>,
    provenance: JSON.parse(row.provenance_json) as unknown[],
    createdAt: row.created_at,
  }));
}

export async function discoveryFactsForJob(jobId: string): Promise<StoredDiscoveryItem | null> {
  const db = getDriver();
  const row = await db.get<{
    id: string;
    run_id: string;
    cluster_id: string;
    opportunity_id: string | null;
    stage: string;
    triage_bucket: string | null;
    provider_id: string;
    live: number | boolean;
    title: string | null;
    company: string | null;
    location: string | null;
    canonical_url: string | null;
    source_urls_json: string;
    content_hash: string | null;
    normalized_json: string;
    provenance_json: string;
    created_at: string;
  }>("SELECT * FROM discovery_items WHERE opportunity_id = ? OR cluster_id = ? ORDER BY created_at DESC LIMIT 1", [
    jobId,
    jobId,
  ]);
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    clusterId: row.cluster_id,
    opportunityId: row.opportunity_id,
    stage: row.stage,
    triageBucket: row.triage_bucket,
    providerId: row.provider_id,
    live: Boolean(row.live),
    title: row.title,
    company: row.company,
    location: row.location,
    canonicalUrl: row.canonical_url,
    sourceUrls: JSON.parse(row.source_urls_json) as string[],
    contentHash: row.content_hash,
    normalized: JSON.parse(row.normalized_json) as Record<string, unknown>,
    provenance: JSON.parse(row.provenance_json) as unknown[],
    createdAt: row.created_at,
  };
}
