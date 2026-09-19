"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bootApp } from "@/lib/boot";
import { isDemoMode } from "@/lib/jev/client";
import { getProfile } from "@/lib/db/store";
import { getBrowserSession, insertAudit, saveBrowserSession } from "@/lib/db/store-extended";
import { demoStartUrl, observeDemoPage, type DemoPage } from "@/lib/browser/demo-board";
import { buildActionSpace } from "@/lib/browser/action-space";
import { executeBrowserDecision } from "@/lib/browser/executor";
import { getDecisionProvider } from "@/lib/providers/factory";
import { ingestCanonical } from "@/lib/ingest/pipeline";
import { ensureTodayBriefing } from "@/lib/briefing-service";
import { POLICY_VERSION } from "@/lib/policy/version";
import type { BrowserTask } from "@/lib/browser/types";

function defaultTask(): BrowserTask {
  return {
    kind: "READ_ONLY_DISCOVERY",
    goal: "Collect Melbourne data / AI roles into Apply OS Inbox. Do not apply.",
    startUrl: demoStartUrl(),
    maxJobs: 5,
    allowPagination: true,
    importedJobIds: [],
    sessionOptInMedium: false,
  };
}

export async function startDiscoverySession(): Promise<void> {
  await bootApp();
  const id = randomUUID();
  const task = defaultTask();
  await saveBrowserSession({
    id,
    task,
    page: { kind: "results", page: 1 },
    status: "running",
    demo: isDemoMode(),
    createdAt: new Date().toISOString(),
  });
  await insertAudit({
    userId: "default",
    jobId: null,
    eventType: "BROWSER_ACTION_PROPOSED",
    profileVersion: null,
    policyVersion: POLICY_VERSION,
    modelProvider: isDemoMode() ? "DEMO" : "JEV",
    modelVersion: "discovery",
    inputHash: null,
    observationVersion: null,
    decisionSummary: { sessionId: id, phase: "READ_ONLY_DISCOVERY" },
    policyResult: { liveBrowser: false },
    executionResult: {},
  });
  redirect(`/discover?session=${id}`);
}

export async function stepDiscovery(sessionId: string): Promise<void> {
  await bootApp();
  const session = await getBrowserSession(sessionId);
  if (!session || session.status === "stopped") return;

  const observation = observeDemoPage({
    sessionId,
    task: session.task,
    step: session.task.importedJobIds.length,
    page: session.page,
    recentActions: [],
  });
  const space = buildActionSpace(observation, session.task);
  const provider = getDecisionProvider();
  const decision = await provider.decideBrowserAction({
    browserState: observation,
    actionSpace: space,
    task: session.task,
  });

  await insertAudit({
    userId: "default",
    jobId: null,
    eventType: "BROWSER_ACTION_PROPOSED",
    profileVersion: null,
    policyVersion: POLICY_VERSION,
    modelProvider: provider.name === "DEMO" ? "DEMO" : "JEV",
    modelVersion: provider.modelVersion,
    inputHash: null,
    observationVersion: observation.page.observationVersion,
    decisionSummary: { action: decision.action, rationale: decision.rationaleCode },
    policyResult: { flags: space.flags },
    executionResult: {},
  });

  const result = executeBrowserDecision({
    decision,
    observation,
    task: session.task,
    page: session.page,
    approvalToken: false,
  });

  if (result.status === "blocked" || result.status === "stale" || result.status === "incompatible") {
    await insertAudit({
      userId: "default",
      jobId: null,
      eventType: "BROWSER_ACTION_BLOCKED",
      profileVersion: null,
      policyVersion: POLICY_VERSION,
      modelProvider: provider.name === "DEMO" ? "DEMO" : "JEV",
      modelVersion: provider.modelVersion,
      inputHash: null,
      observationVersion: observation.page.observationVersion,
      decisionSummary: { action: decision.action },
      policyResult: { reason: result.reason },
      executionResult: { status: result.status },
    });
    if (decision.action.kind === "STOP") {
      session.status = "stopped";
      await saveBrowserSession(session);
    }
    revalidatePath("/discover");
    return;
  }

  if (result.importedJobId) {
    const profile = await getProfile();
    const { demoJobRaw } = await import("@/lib/browser/demo-board");
    const posting = demoJobRaw(result.importedJobId);
    if (profile && posting) {
      await ingestCanonical({
        rawText: posting.rawText,
        url: `https://jobs.demo.apply-os.local/jobs/${posting.id}`,
        sourceType: posting.sourceType,
        profile,
        existingId: `${posting.id}-discovered`,
      });
      session.task.importedJobIds.push(posting.id);
      await ensureTodayBriefing(true);
    }
  }

  if (result.page) session.page = result.page as DemoPage;
  if (decision.action.kind === "STOP" || session.task.importedJobIds.length >= session.task.maxJobs) {
    session.status = "stopped";
  }
  await saveBrowserSession(session);
  await insertAudit({
    userId: "default",
    jobId: result.importedJobId ?? null,
    eventType: "BROWSER_ACTION_EXECUTED",
    profileVersion: null,
    policyVersion: POLICY_VERSION,
    modelProvider: provider.name === "DEMO" ? "DEMO" : "JEV",
    modelVersion: provider.modelVersion,
    inputHash: null,
    observationVersion: result.after?.page.observationVersion ?? observation.page.observationVersion,
    decisionSummary: { action: decision.action, rationale: decision.rationaleCode },
    policyResult: {},
    executionResult: { status: result.status, reason: result.reason, imported: result.importedJobId ?? null },
  });
  revalidatePath("/discover");
  revalidatePath("/inbox");
  revalidatePath("/");
}

export async function stopDiscovery(sessionId: string): Promise<void> {
  await bootApp();
  const session = await getBrowserSession(sessionId);
  if (!session) return;
  session.status = "stopped";
  await saveBrowserSession(session);
  revalidatePath("/discover");
}
