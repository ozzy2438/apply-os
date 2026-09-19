import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureContext, fixturePolicy } from "./fixture";
import { makePlan } from "./planner";
import { templateDraft } from "./writer";
import { guardDraft } from "./guard";
import { createResumeJevRunner } from "./host";
import { makeJevReviewer } from "./jev-adapter";
import { isDemoMode } from "@/lib/jev/client";

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

describe.skipIf(process.env.LIVE_RESUME_SMOKE !== "1")("live resume studio Jev smoke", () => {
  it(
    "scores the fictional fixture with live Jev and does not send the canonical profile",
    async () => {
      expect(process.env.TYPESAFE_API_KEY?.trim(), "NOT_RUN: TYPESAFE_API_KEY missing").toBeTruthy();
      expect(isDemoMode()).toBe(false);

      const hosted = createResumeJevRunner();
      expect(hosted, "NOT_RUN: createResumeJevRunner returned null").toBeTruthy();
      if (!hosted) return;

      const ctx = fixtureContext();
      expect(ctx.header.fullName).toContain("fictional");
      const policy = { ...fixturePolicy(), timeoutMs: 60_000 };
      const plan = makePlan(ctx, policy);
      const draft = templateDraft(ctx, plan, policy);
      const guard = guardDraft(ctx, plan, draft, policy);
      expect(guard.passed, guard.errors.join(",")).toBe(true);

      const review = await makeJevReviewer(hosted.runner, hosted.model).review(
        ctx,
        plan,
        draft,
        policy,
        AbortSignal.timeout(60_000),
      );

      expect(review.mode).toBe("live");
      expect(review.status).toBe("scored");
      expect(review.resolvedModel).toBeTruthy();
      expect(review.readinessScore).toEqual(expect.any(Number));
      expect(review.dimensions).toHaveLength(9);
      for (const row of review.dimensions) {
        expect(row.raw).toBeGreaterThanOrEqual(0);
        expect(row.raw).toBeLessThanOrEqual(4);
        expect(row.confidence).toBeGreaterThanOrEqual(0);
        expect(row.confidence).toBeLessThanOrEqual(1);
      }
      const blob = JSON.stringify(review);
      expect(blob).not.toContain("alex@example.com");
      expect(blob).not.toMatch(/\bP02\b/);
    },
    90_000,
  );
});
