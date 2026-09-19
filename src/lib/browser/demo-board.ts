import { SAMPLE_POSTINGS } from "@/lib/seed/fixtures";
import type { BrowserElement, BrowserObservation, BrowserTask } from "./types";
import { nowIso } from "@/lib/time";
import { sha256 } from "@/lib/domain/hash";

const BOARD_JOBS = SAMPLE_POSTINGS.filter((p) =>
  ["job-horizon", "job-ledger", "job-southbank", "job-nyc", "job-grad", "job-warehouse"].includes(p.id),
);

export type DemoPage =
  | { kind: "results"; page: number }
  | { kind: "detail"; jobId: string }
  | { kind: "apply"; jobId: string };

export function demoStartUrl(): string {
  return "https://jobs.demo.apply-os.local/results?q=data+scientist+melbourne";
}

function versionFor(page: DemoPage, step: number): string {
  return sha256(JSON.stringify({ page, step })).slice(0, 16);
}

function resultsElements(): BrowserElement[] {
  const cards: BrowserElement[] = BOARD_JOBS.map((job) => ({
    id: `el-job-${job.id}`,
    role: "link",
    name: `${job.title} — ${job.company}`,
    value: null,
    visible: true,
    enabled: true,
    supportedActions: ["CLICK"],
    risk: "LOW",
    metadata: { jobId: job.id },
  }));
  return [
    {
      id: "el-search",
      role: "textbox",
      name: "Search jobs",
      value: "data scientist melbourne",
      visible: true,
      enabled: true,
      supportedActions: ["TYPE_TEXT"],
      risk: "MEDIUM",
      metadata: {},
    },
    ...cards,
    {
      id: "el-next",
      role: "button",
      name: "Next page",
      value: null,
      visible: true,
      enabled: true,
      supportedActions: ["CLICK"],
      risk: "LOW",
      metadata: {},
    },
    {
      id: "el-easy",
      role: "checkbox",
      name: "Easy Apply only",
      value: "off",
      visible: true,
      enabled: true,
      supportedActions: ["CHECK"],
      risk: "MEDIUM",
      metadata: {},
    },
  ];
}

function detailElements(jobId: string): BrowserElement[] {
  return [
    {
      id: `el-extract-${jobId}`,
      role: "button",
      name: "Import this job into Apply OS",
      value: null,
      visible: true,
      enabled: true,
      supportedActions: ["CLICK"],
      risk: "LOW",
      metadata: { jobId },
    },
    {
      id: `el-save-${jobId}`,
      role: "button",
      name: "Save job",
      value: null,
      visible: true,
      enabled: true,
      supportedActions: ["CLICK"],
      risk: "MEDIUM",
      metadata: { jobId, isExternalNavigation: false },
    },
    {
      id: `el-apply-${jobId}`,
      role: "button",
      name: "Apply now",
      value: null,
      visible: true,
      enabled: true,
      supportedActions: ["CLICK"],
      risk: "IRREVERSIBLE",
      metadata: { jobId, isSubmissionControl: true },
    },
    {
      id: "el-back",
      role: "button",
      name: "Back to results",
      value: null,
      visible: true,
      enabled: true,
      supportedActions: ["CLICK"],
      risk: "LOW",
      metadata: {},
    },
  ];
}

export function observeDemoPage(input: {
  sessionId: string;
  task: BrowserTask;
  step: number;
  page: DemoPage;
  recentActions: BrowserObservation["recentActions"];
}): BrowserObservation {
  const current = input.page;
  if (current.kind === "results") {
    const summary = `Search results · ${BOARD_JOBS.length} jobs found\n${BOARD_JOBS.map((j) => `${j.title} — ${j.company} — ${j.location}`).join("\n")}`;
    return {
      sessionId: input.sessionId,
      taskId: input.task.kind,
      step: input.step,
      page: {
        url: `${demoStartUrl()}&page=${current.page}`,
        title: "Demo job search — Melbourne data roles",
        domain: "jobs.demo.apply-os.local",
        observationVersion: versionFor(input.page, input.step),
        capturedAt: nowIso(),
      },
      visibleTextSummary: summary,
      elements: resultsElements(),
      recentActions: input.recentActions,
    };
  }

  if (current.kind === "detail") {
    const job = BOARD_JOBS.find((j) => j.id === current.jobId) ?? BOARD_JOBS[0];
    return {
      sessionId: input.sessionId,
      taskId: input.task.kind,
      step: input.step,
      page: {
        url: `https://jobs.demo.apply-os.local/jobs/${job.id}`,
        title: `${job.title} — ${job.company}`,
        domain: "jobs.demo.apply-os.local",
        observationVersion: versionFor(current, input.step),
        capturedAt: nowIso(),
      },
      visibleTextSummary: job.rawText,
      elements: detailElements(job.id),
      recentActions: input.recentActions,
    };
  }

  const applyPage = current.kind === "apply" ? current : { kind: "apply" as const, jobId: BOARD_JOBS[0].id };
  const job = BOARD_JOBS.find((j) => j.id === applyPage.jobId) ?? BOARD_JOBS[0];
  return {
    sessionId: input.sessionId,
    taskId: input.task.kind,
    step: input.step,
    page: {
      url: `https://jobs.demo.apply-os.local/jobs/${job.id}/apply`,
      title: `Apply — ${job.title}`,
      domain: "jobs.demo.apply-os.local",
      observationVersion: versionFor(input.page, input.step),
      capturedAt: nowIso(),
    },
    visibleTextSummary: "Application form. Submit is irreversible. CAPTCHA may appear.",
    elements: [
      {
        id: "el-submit",
        role: "button",
        name: "Submit application",
        value: null,
        visible: true,
        enabled: true,
        supportedActions: ["CLICK"],
        risk: "IRREVERSIBLE",
        metadata: { isSubmissionControl: true, jobId: job.id },
      },
    ],
    recentActions: input.recentActions,
  };
}

export function applyDemoAction(
  page: DemoPage,
  action: { kind: string; targetId?: string },
): { page: DemoPage; importedJobId?: string; blocked?: string } {
  if (action.kind === "STOP") return { page };
  if (action.targetId === "el-next") return { page: { kind: "results", page: page.kind === "results" ? page.page + 1 : 1 } };
  if (action.targetId === "el-back") return { page: { kind: "results", page: 1 } };
  if (action.targetId?.startsWith("el-job-")) {
    return { page: { kind: "detail", jobId: action.targetId.replace("el-job-", "") } };
  }
  if (action.targetId?.startsWith("el-extract-")) {
    return { page, importedJobId: action.targetId.replace("el-extract-", "") };
  }
  if (action.targetId?.startsWith("el-apply-") || action.targetId === "el-submit") {
    return { page, blocked: "IRREVERSIBLE apply/submit is not allowed without a just-in-time approval token." };
  }
  return { page };
}

export function demoJobRaw(jobId: string): (typeof SAMPLE_POSTINGS)[number] | undefined {
  return SAMPLE_POSTINGS.find((p) => p.id === jobId);
}
