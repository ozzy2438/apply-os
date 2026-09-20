import { score } from "@typesafe-ai/sdk";
import { getJevRuntime, isDemoMode } from "@/lib/jev/client";
import type { ResumeContext, ResumePlan, ResumePolicy, ReviewResult, WriterPort } from "./types";
import { makeJevReviewer, type JevRunner } from "./jev-adapter";
import { WRITER_INSTRUCTIONS, templateWriter } from "./writer";
import { parseDraft } from "./validation";

const WRITER_REVISION = "apply-os-writer-1.0.0";

function openaiKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim() || process.env.NETLIFY_OPENAI_API_KEY?.trim();
}

const DRAFT_FIELDS = [
  "planId",
  "summaryClaimIds",
  "skillClaimIds",
  "entries",
  "educationClaimIds",
  "certificationClaimIds",
] as const;

const CLAIM_ID_FIELDS = [
  "summaryClaimIds",
  "skillClaimIds",
  "educationClaimIds",
  "certificationClaimIds",
] as const;

/** Host sanitises untrusted model JSON before the strict draft parser. */
export function pickResumeDraftJson(raw: unknown, planId?: string): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const source = raw as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of DRAFT_FIELDS) picked[key] = source[key];
  if (planId) picked.planId = planId;
  for (const key of CLAIM_ID_FIELDS) {
    if (!Array.isArray(picked[key])) picked[key] = [];
  }
  if (Array.isArray(source.entries)) {
    picked.entries = source.entries.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const row = entry as Record<string, unknown>;
      return { subjectId: row.subjectId, claimIds: row.claimIds };
    });
  } else {
    picked.entries = [];
  }
  return picked;
}

export function createResumeWriter(ctx: ResumeContext, plan: ResumePlan, policy: ResumePolicy): WriterPort {
  const key = openaiKey();
  if (!key) return templateWriter(ctx, plan, policy);

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  return {
    revision: `${WRITER_REVISION}:${model}`,
    mode: "live",
    async write(input) {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({
        apiKey: key,
        baseURL: process.env.OPENAI_BASE_URL || undefined,
      });
      const completion = await client.chat.completions.create(
        {
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: WRITER_INSTRUCTIONS },
            {
              role: "user",
              content: JSON.stringify({
                requiredPlanId: plan.id,
                contract: {
                  planId: plan.id,
                  summaryClaimIds: ["approved claim id"],
                  skillClaimIds: ["approved claim id"],
                  entries: [{ subjectId: "plan entry subject id", claimIds: ["approved claim id"] }],
                  educationClaimIds: ["approved claim id"],
                  certificationClaimIds: ["approved claim id"],
                },
                state: input.state,
                phase: input.phase,
              }),
            },
          ],
        },
        { signal: input.signal },
      );
      const raw = completion.choices[0]?.message?.content ?? "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("WRITER_FAILED");
      return parseDraft(pickResumeDraftJson(JSON.parse(match[0]), plan.id));
    },
  };
}

function scoreAnswers(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error("INVALID_JEV_RESPONSE");
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") throw new Error(`MISSING_OR_INVALID_SCORE:${key}`);
    const row = raw as { score?: unknown; confidence?: unknown };
    if (!Number.isFinite(row.score) || !Number.isFinite(row.confidence)) throw new Error(`MISSING_OR_INVALID_SCORE:${key}`);
    out[key] = { score: row.score, confidence: row.confidence };
  }
  return out;
}

export function createResumeJevRunner(): { runner: JevRunner; model: string } | null {
  const runtime = getJevRuntime();
  if (runtime.demo || isDemoMode()) return null;
  return {
    model: runtime.model,
    runner: async (call) => {
      const questions = Object.fromEntries(
        Object.entries(call.request.questions).map(([id, q]) => {
          const criteria = q.criteria as unknown as readonly [string, string, ...string[]];
          return [id, score(q.instructions, criteria)];
        }),
      );
      const result = await runtime.systemOne(
        {
          model: call.request.model,
          state: JSON.parse(JSON.stringify(call.request.state)),
          questions,
        },
        { signal: call.signal, retry: { maxRetries: 0 } },
      );
      const usage =
        result && typeof result === "object" && "usage" in result
          ? (result as { usage?: unknown }).usage
          : undefined;
      return {
        answers: scoreAnswers(result.answers),
        model: typeof result.model === "string" ? result.model : runtime.model,
        usage: usage ?? "unknown",
      };
    },
  };
}

export function createResumeReviewer(policy: ResumePolicy) {
  void policy;
  const hosted = createResumeJevRunner();
  if (!hosted) return undefined;
  return makeJevReviewer(hosted.runner, hosted.model);
}

export function reviewModeLabel(review: ReviewResult | null, writerMode: "live" | "template" | "not_run"): string {
  if (writerMode === "template") return "TEMPLATE";
  if (!review || review.status === "unavailable") return "REVIEW_UNAVAILABLE";
  if (review.mode === "mock") return "MOCK";
  return "LIVE";
}
