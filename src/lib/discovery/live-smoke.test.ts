import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exaEnabled, exaApiKey } from "./flags";
import { createExaProvider } from "./providers/exa";
import { buildSearchQueries } from "./queries";

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

describe.skipIf(process.env.LIVE_DISCOVERY_SMOKE !== "1")("live Exa discovery smoke", () => {
  it(
    "searches enabled role families and returns labeled live metadata",
    async () => {
      expect(exaApiKey(), "NOT_RUN: EXA_API_KEY missing").toBeTruthy();
      expect(exaEnabled()).toBe(true);
      const query = buildSearchQueries()[0];
      expect(query).toBeTruthy();
      const batch = await createExaProvider().discover(query!);
      expect(batch.live).toBe(true);
      expect(batch.providerId).toBe("exa");
      if (batch.error) {
        expect(batch.error, `LIVE DISCOVERY ERROR: ${batch.error}`).toBeUndefined();
      }
      expect(Array.isArray(batch.items)).toBe(true);
    },
    60_000,
  );
});
