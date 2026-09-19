import type { SystemOneRequest, SystemOneResult, Questions } from "@typesafe-ai/sdk";
import type { ChoiceLike, EvaluationAnswers, NoulLike, ScoreLike } from "./compose";
import type { ActionId, EvaluationState } from "./types";
import { SCORE_LEVELS } from "./questions";

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function noulAnswer(value: number): NoulLike {
  return { type: "noul", noul: clamp01(value) };
}

function peaked(center: number, n: number): Record<string, number> {
  const raw = Array.from({ length: n }, (_, i) => Math.exp(-((i - center) ** 2) / 0.72));
  const sum = raw.reduce((a, b) => a + b, 0);
  const probabilities: Record<string, number> = {};
  raw.forEach((v, i) => {
    probabilities[String(i)] = v / sum;
  });
  return probabilities;
}

function scoreAnswer(level: number, confidence = 0.86): ScoreLike {
  const clamped = Math.min(4, Math.max(0, level));
  return {
    type: "score",
    score: clamped,
    confidence,
    probabilities: peaked(clamped, SCORE_LEVELS.length),
    legend: Object.fromEntries(SCORE_LEVELS.map((label, i) => [String(i), label])),
  } as ScoreLike & { legend: Record<string, string> };
}

function choiceAnswer(choice: ActionId, confidence: number): ChoiceLike {
  const keys: ActionId[] = ["apply_now", "tailor_then_apply", "skip", "needs_review"];
  const remaining = (1 - confidence) / (keys.length - 1);
  const probabilities: Record<string, number> = {};
  for (const key of keys) probabilities[key] = key === choice ? confidence : remaining;
  return { type: "choice", choice, confidence, probabilities };
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(n));
}

function extractMaxPay(text: string): number | null {
  const matches = [...text.matchAll(/\$?\s?(\d{2,3})\s?[,k]\s?000|\$(\d{2,3}),000|(\d{2,3})k\b/gi)];
  const values: number[] = [];
  for (const m of matches) {
    const n = Number(m[1] || m[2] || m[3]);
    if (!Number.isFinite(n)) continue;
    values.push(n < 1000 ? n * 1000 : n);
  }
  return values.length ? Math.max(...values) : null;
}

export function heuristicEvaluationAnswers(state: EvaluationState): EvaluationAnswers {
  const posting = `${state.posting.title}\n${state.posting.company}\n${state.posting.location}\n${state.posting.compensation ?? ""}\n${state.posting.rawText}`.toLowerCase();
  const title = state.posting.title.toLowerCase();
  const cv = state.profile.cv.map((b) => b.text).join("\n").toLowerCase();
  const goals = state.profile.goals.toLowerCase();
  const floor = state.profile.constraints.compensationFloorAud;
  const locations = state.profile.constraints.locations.map((l) => l.toLowerCase());
  const workRights = state.profile.constraints.workRights.toLowerCase();
  const mode = state.profile.constraints.workMode.toLowerCase();

  const usOnly = hasAny(posting, [
    "us citizen",
    "must be a u.s",
    "no visa sponsorship",
    "without sponsorship",
    "green card",
    "united states only",
    "onsite in new york",
    "nyc only",
  ]);
  const auOk = hasAny(posting, ["australian citizen", "australia", "melbourne", "sydney", "can work in australia"]);
  const workRightsFail = usOnly && workRights.includes("australian") && !auOk;

  const foreignOnsite =
    hasAny(posting, ["onsite", "on-site", "in office"]) &&
    hasAny(posting, ["new york", "san francisco", "london", "seattle", "austin"]) &&
    !hasAny(posting, ["melbourne", "australia", "remote australia"]);
  const locationFail =
    foreignOnsite &&
    locations.some((l) => l.includes("melbourne") || l.includes("australia")) &&
    !mode.includes("anywhere");

  const maxPay = extractMaxPay(posting);
  const compensationFail = maxPay !== null && maxPay < floor * 0.9;

  const phdRequired = hasAny(posting, ["phd required", "ph.d. required", "must have a phd"]);
  const hasPhd = cv.includes("phd") || cv.includes("ph.d");
  const credentialFail = phdRequired && !hasPhd;

  const ds = hasAny(title, [
    "data scientist",
    "machine learning",
    "ml engineer",
    "applied scientist",
    "ai engineer",
    "applied ml",
  ]);
  const forecasting = hasAny(posting, ["forecast", "demand", "pricing", "decisioning", "govern"]);
  const genai = hasAny(posting, ["genai", "llm", "agent", "generative"]);
  const junior = hasAny(title, ["graduate", "intern", "junior", "entry"]);
  const staff = hasAny(title, ["staff", "principal", "director", "head of"]);
  const vague = state.posting.sourceType === "recruiter_inbound" && posting.length < 900;
  const deOnly = title.includes("data engineer") && !ds;

  let goal = 1;
  if (ds && (forecasting || genai || goals.includes("decision"))) goal = 3.4;
  if (ds && forecasting && goals.includes("production")) goal = 3.8;
  if (junior) goal = 0.6;
  if (workRightsFail || locationFail) goal = 0.4;
  if (deOnly) goal = 2.1;
  if (vague) goal = 1.2;

  let evidence = ds ? 3.2 : 1.4;
  if (forecasting && (cv.includes("forecast") || cv.includes("decision"))) evidence = 3.6;
  if (cv.includes("govern") && posting.includes("govern")) evidence = 3.7;
  if (junior || workRightsFail) evidence = 1.0;
  if (deOnly) evidence = 2.2;

  let seniority = 3.1;
  if (junior) seniority = 0.5;
  if (staff) seniority = 2.0;
  if (hasAny(posting, ["mid", "senior", "ic"])) seniority = 3.3;

  let domain = ds ? 3.0 : 1.5;
  if (forecasting || genai) domain = 3.4;
  if (deOnly) domain = 2.3;
  if (hasAny(posting, ["fmcg manufacturing only"])) domain = 1.6;

  let comp = 3.0;
  if (compensationFail) comp = 0.4;
  else if (maxPay === null) comp = 2.2;
  else if (maxPay >= floor) comp = 3.5;

  let action: ActionId = "tailor_then_apply";
  let confidence = 0.82;
  if (workRightsFail || locationFail || compensationFail || credentialFail || junior) {
    action = "skip";
    confidence = 0.91;
  } else if (vague) {
    action = "needs_review";
    confidence = 0.58;
  } else if (staff || deOnly) {
    action = "tailor_then_apply";
    confidence = 0.78;
  } else if (goal >= 3.3 && evidence >= 3.2) {
    action = "apply_now";
    confidence = 0.88;
  }

  const answers = {
    work_rights: noulAnswer(workRightsFail ? 0.93 : 0.06),
    location: noulAnswer(locationFail ? 0.91 : 0.08),
    compensation: noulAnswer(compensationFail ? 0.9 : 0.07),
    credential: noulAnswer(credentialFail ? 0.92 : 0.05),
    goal_alignment: scoreAnswer(goal, vague ? 0.5 : 0.86),
    cv_evidence: scoreAnswer(evidence),
    seniority_fit: scoreAnswer(seniority),
    domain_fit: scoreAnswer(domain),
    comp_reality: scoreAnswer(comp, maxPay === null ? 0.55 : 0.84),
    action: choiceAnswer(action, confidence),
  } satisfies EvaluationAnswers;

  return answers;
}

export function heuristicCitationRelation(
  claim: string,
  evidence: string,
): { choice: "supports" | "contradicts" | "says_nothing"; confidence: number } {
  const c = claim.toLowerCase();
  const e = evidence.toLowerCase();
  if (c.includes("production owner") && (e.includes("independent") || e.includes("production-style"))) {
    return { choice: "contradicts", confidence: 0.9 };
  }
  const overlap = c.split(" ").filter((w) => w.length > 4 && e.includes(w)).length;
  if (e.length > 20 && overlap >= 3) {
    return { choice: "supports", confidence: 0.93 };
  }
  return { choice: "says_nothing", confidence: 0.62 };
}

export function heuristicGuards(letter: string, cv: string): Record<"inflated_tenure" | "fake_production" | "tools_not_in_cv", NoulLike> {
  const l = letter.toLowerCase();
  const c = cv.toLowerCase();
  const inflated = /\b(\d{2}|ten|twelve)\+?\s+years\b/.test(l) && !c.includes("10+") && !c.includes("12");
  const claimsLiveOwnership =
    /\bproduction owners?\b/.test(l) ||
    l.includes("enterprise adopted") ||
    l.includes("operated in production for");
  const cvDeniesLiveOwnership = c.includes("independent") || c.includes("production-style");
  const fakeProd = claimsLiveOwnership && !c.includes("production-operated") && cvDeniesLiveOwnership;
  const tools = ["sas viya", "kubernetes operator", "spark streaming", "snowflake"].filter(
    (t) => l.includes(t) && !c.includes(t),
  );
  return {
    inflated_tenure: noulAnswer(inflated ? 0.88 : 0.08),
    fake_production: noulAnswer(fakeProd ? 0.9 : 0.1),
    tools_not_in_cv: noulAnswer(tools.length ? 0.86 : 0.07),
  };
}

export async function mockSystemOne<Q extends Questions>(
  request: SystemOneRequest<Q>,
  _options?: unknown,
): Promise<SystemOneResult<Q>> {
  const state = request.state as EvaluationState | Record<string, unknown> | string;
  const names = Object.keys(request.questions);
  const answers: Record<string, unknown> = {};

  const postingState =
    typeof state === "object" && state && "posting" in state ? (state as EvaluationState) : null;

  if (names.includes("work_rights") && postingState) {
    Object.assign(answers, heuristicEvaluationAnswers(postingState));
  }

  if (names.includes("relation")) {
    const claim = typeof state === "object" && state && "claim" in state ? String((state as { claim: string }).claim) : "";
    const section =
      typeof state === "object" && state && "section" in state ? String((state as { section: string }).section) : "";
    const rel = heuristicCitationRelation(claim, section);
    answers.relation = {
      type: "choice",
      choice: rel.choice,
      confidence: rel.confidence,
      probabilities: {
        supports: rel.choice === "supports" ? rel.confidence : (1 - rel.confidence) / 2,
        contradicts: rel.choice === "contradicts" ? rel.confidence : (1 - rel.confidence) / 2,
        says_nothing: rel.choice === "says_nothing" ? rel.confidence : (1 - rel.confidence) / 2,
      },
    };
  }

  if (names.includes("inflated_tenure")) {
    const letter = typeof state === "object" && state && "letter" in state ? String((state as { letter: string }).letter) : "";
    const cv =
      typeof state === "object" && state && "profile" in state
        ? JSON.stringify((state as { profile: unknown }).profile)
        : "";
    Object.assign(answers, heuristicGuards(letter, cv));
  }

  for (const name of names) {
    if (answers[name]) continue;
    const q = request.questions[name];
    if (q.type === "noul") answers[name] = noulAnswer(0.12);
    else if (q.type === "score") answers[name] = scoreAnswer(2);
    else answers[name] = { type: "choice", choice: Object.keys(q.criteria ?? { other: null })[0], confidence: 0.5, probabilities: {} };
  }

  return {
    model: "jev-mock",
    answers: answers as SystemOneResult<Q>["answers"],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}
