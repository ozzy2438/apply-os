export const ELEMENT_ROLES = [
  "button",
  "link",
  "textbox",
  "combobox",
  "checkbox",
  "radio",
  "tab",
  "menuitem",
  "option",
  "other",
] as const;
export type ElementRole = (typeof ELEMENT_ROLES)[number];

export const ELEMENT_ACTIONS = ["CLICK", "TYPE_TEXT", "SELECT_OPTION", "CHECK", "UNCHECK"] as const;
export type ElementAction = (typeof ELEMENT_ACTIONS)[number];

export const RISK_LEVELS = ["NONE", "LOW", "MEDIUM", "HIGH", "IRREVERSIBLE"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export type BrowserElement = {
  id: string;
  role: ElementRole;
  name: string;
  value: string | null;
  visible: boolean;
  enabled: boolean;
  supportedActions: ElementAction[];
  risk: RiskLevel;
  metadata: {
    jobId?: string;
    optionIds?: string[];
    isExternalNavigation?: boolean;
    isSubmissionControl?: boolean;
    isPassword?: boolean;
    isPayment?: boolean;
    isCaptcha?: boolean;
  };
};

export type BrowserObservation = {
  sessionId: string;
  taskId: string;
  step: number;
  page: {
    url: string;
    title: string;
    domain: string;
    observationVersion: string;
    capturedAt: string;
  };
  visibleTextSummary: string;
  elements: BrowserElement[];
  recentActions: Array<{
    action: string;
    targetId?: string;
    result: string;
    createdAt: string;
  }>;
};

export type BrowserAction =
  | { kind: "CLICK"; targetId: string; expectedPostcondition: string; rationaleHint?: string }
  | { kind: "TYPE_TEXT"; targetId: string; expectedPostcondition: string; rationaleHint?: string }
  | { kind: "SELECT_OPTION"; targetId: string; optionId: string; expectedPostcondition: string; rationaleHint?: string }
  | { kind: "SCROLL"; direction: "UP" | "DOWN"; amount: "SMALL" | "MEDIUM" | "LARGE"; expectedPostcondition: string }
  | { kind: "GO_BACK"; expectedPostcondition: string }
  | { kind: "WAIT"; milliseconds: number; expectedPostcondition: string }
  | { kind: "STOP"; reason: string }
  | { kind: "REQUEST_USER_APPROVAL"; reason: string; proposedAction: string };

export type BrowserActionSpace = {
  observationVersion: string;
  actions: BrowserAction[];
  indexed: Array<{ index: number; label: string; action: BrowserAction; risk: RiskLevel }>;
  flags: {
    pageLooksLikeJobDetail: boolean;
    pageLooksLikeResults: boolean;
    hasCaptcha: boolean;
    hasLoginWall: boolean;
  };
};

export type BrowserTask = {
  kind: "URL_IMPORT" | "READ_ONLY_DISCOVERY" | "LOW_RISK_ASSIST" | "FORM_ASSIST";
  goal: string;
  startUrl: string;
  maxJobs: number;
  allowPagination: boolean;
  importedJobIds: string[];
  sessionOptInMedium: boolean;
};

export type BrowserActionDecision = {
  observationVersion: string;
  action: BrowserAction;
  confidence: number;
  rationaleCode:
    | "DISCOVER_JOB"
    | "OPEN_JOB_DETAIL"
    | "CONTINUE_PAGINATION"
    | "EXTRACT_JOB"
    | "NEEDS_APPROVAL"
    | "TASK_COMPLETE"
    | "INSUFFICIENT_INFORMATION";
};

export type BrowserSession = {
  id: string;
  task: BrowserTask;
  phase: BrowserTask["kind"];
  status: "idle" | "running" | "paused" | "stopped" | "failed";
  createdAt: string;
  demo: boolean;
};

export type ApprovalKind = "MEDIUM" | "HIGH" | "IRREVERSIBLE" | "SUBMIT" | "MESSAGE" | "UPLOAD";

export type ApprovalEvent = {
  id: string;
  sessionId: string | null;
  jobId: string | null;
  kind: ApprovalKind;
  summary: string;
  createdAt: string;
};
