import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { draftCoverLetter } from "@/lib/cover-letter";
import { locateQuote } from "@/lib/jev/citations";
import type { Opportunity, Profile } from "@/lib/jev/types";
import { evidenceFromBullets } from "@/lib/policy/evidence";
import { createGenerationProvider } from "@/lib/providers/openai-generation";
import { normalizeJobPosting } from "@/lib/ingest/normalize";
import { DEFAULT_CANDIDATE_PROFILE } from "@/lib/domain/defaults";
import { SAMPLE_BULLETS, SAMPLE_CONSTRAINTS, SAMPLE_GOALS, SAMPLE_POSTINGS, SAMPLE_WEIGHTS } from "@/lib/seed/fixtures";
import { fixtureContext, fixturePolicy } from "@/lib/resume/fixture";
import { makePlan } from "@/lib/resume/planner";
import { guardDraft, selectedClaimIds } from "@/lib/resume/guard";
import { createResumeWriter } from "@/lib/resume/host";
import { buildResume } from "@/lib/resume/pipeline";
import { writerState } from "@/lib/resume/writer";

/** Next-style local env. Values are never logged. */
function loadEnvLocal(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const row = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = row.indexOf("=");
    if (eq < 1) continue;
    const key = row.slice(0, eq).trim();
    let value = row.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

const live = process.env.LIVE_OPENAI_SMOKE === "1";

describe.skipIf(!live)("live OpenAI writer smoke", () => {
  it(
    "selects approved claim IDs for the fictional resume fixture",
    async () => {
      const key = process.env.OPENAI_API_KEY?.trim() || process.env.NETLIFY_OPENAI_API_KEY?.trim();
      expect(key, "NOT_RUN: OPENAI_API_KEY missing").toBeTruthy();

      const ctx = fixtureContext();
      expect(ctx.header.fullName).toContain("fictional");
      const policy = { ...fixturePolicy(), timeoutMs: 60_000 };
      const plan = makePlan(ctx, policy);
      const writer = createResumeWriter(ctx, plan, policy);
      expect(writer.mode).toBe("live");

      const state = JSON.stringify(writerState(ctx, plan, policy));
      expect(state).not.toContain("alex@example.com");
      expect(state).not.toContain(ctx.header.fullName);

      const result = await buildResume({
        context: ctx,
        policy,
        userRequested: true,
        writer,
      });

      expect(result.generation.mode).toBe("live");
      expect(result.generation.writerCallAttempts).toBeGreaterThan(0);
      const failDetail = [...result.warnings, ...(result.guard?.errors ?? [])].join("; ");
      expect(result.draft, failDetail).toBeTruthy();
      expect(result.status, failDetail).not.toBe("BLOCKED");
      const guard = result.guard ?? guardDraft(ctx, plan, result.draft!, policy);
      expect(guard.passed, guard.errors.join(",")).toBe(true);
      const allowed = new Set(plan.allowedClaimIds);
      for (const id of selectedClaimIds(result.draft!)) {
        expect(allowed.has(id)).toBe(true);
      }
    },
    90_000,
  );

  it(
    "drafts a cover letter from OpenAI without falling back to template",
    async () => {
      const key = process.env.OPENAI_API_KEY?.trim() || process.env.NETLIFY_OPENAI_API_KEY?.trim();
      expect(key, "NOT_RUN: OPENAI_API_KEY missing").toBeTruthy();

      const posting = SAMPLE_POSTINGS.find((p) => p.id === "job-horizon")!;
      const profile: Profile = {
        id: "default",
        goals: SAMPLE_GOALS,
        constraints: SAMPLE_CONSTRAINTS,
        weights: SAMPLE_WEIGHTS,
        bullets: SAMPLE_BULLETS,
        updatedAt: "",
      };
      const opportunity = { ...posting, status: "inbox", createdAt: "" } as Opportunity;
      const draft = await draftCoverLetter(profile, opportunity);
      expect(draft.source).toBe("llm");
      expect(draft.body.length).toBeGreaterThan(40);
      expect(draft.claims.length).toBeGreaterThan(0);
      expect(draft.claims.every((c) => c.cvBulletId && c.quote)).toBe(true);

      const located = draft.claims.filter((c) => locateQuote(c.quote, profile.bullets).status === "found");
      expect(located.length, "live letter returned zero quotes that match CV bullets").toBeGreaterThan(0);

      const job = normalizeJobPosting({
        id: "job-horizon-openai",
        rawText: posting.rawText,
        url: posting.url,
      });
      const generation = createGenerationProvider();
      expect(generation.name).toBe("OPENAI");
      const generated = await generation.draftCoverLetter({
        job,
        candidate: DEFAULT_CANDIDATE_PROFILE,
        evidence: evidenceFromBullets(SAMPLE_BULLETS),
        tone: "conservative",
        maxWords: 220,
      });
      expect(generated.source).toBe("llm");
      expect(generated.claims.length).toBeGreaterThan(0);
    },
    90_000,
  );
});
