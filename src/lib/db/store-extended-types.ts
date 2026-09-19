import type { BrowserTask } from "@/lib/browser/types";
import type { DemoPage } from "@/lib/browser/demo-board";
import type { ApprovalKind } from "@/lib/browser/types";

export type DemoPageLike = DemoPage;

export type BrowserSession = {
  id: string;
  task: BrowserTask;
  page: DemoPage;
  status: "idle" | "running" | "paused" | "stopped" | "failed";
  demo: boolean;
  createdAt: string;
};

export type ApprovalEvent = {
  id: string;
  sessionId: string | null;
  jobId: string | null;
  kind: ApprovalKind;
  summary: string;
  createdAt: string;
};
