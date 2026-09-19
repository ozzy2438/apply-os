import { createHash } from "node:crypto";
import { liveBrowserAllowed } from "./flags";
import { stripHtml } from "@/lib/parse";

export async function playwrightExtractUrl(url: string): Promise<
  | { ok: true; title: string; text: string; snapshotHash: string; finalUrl: string }
  | { ok: false; error: string }
> {
  if (!liveBrowserAllowed()) {
    return { ok: false, error: "Live browser assist is off (demo mode or APPLY_OS_BROWSER_ASSIST is not true)." };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Invalid URL." };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, error: "Only http(s) URLs are allowed." };
  }

  try {
    const spec = "playwright";
    const playwright = (await import(/* webpackIgnore: true */ spec).catch(() => null)) as {
      chromium?: {
        launch: (opts: { headless: boolean }) => Promise<{
          newPage: () => Promise<{
            goto: (url: string, opts: { waitUntil: string; timeout: number }) => Promise<unknown>;
            title: () => Promise<string>;
            content: () => Promise<string>;
            url: () => string;
          }>;
          close: () => Promise<void>;
        }>;
      };
    } | null;
    if (!playwright?.chromium) return { ok: false, error: "Playwright is not installed." };
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(parsed.toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
      const title = await page.title();
      const html = await page.content();
      const text = stripHtml(html).slice(0, 20000);
      const snapshotHash = createHash("sha256").update(html).digest("hex");
      return { ok: true, title, text, snapshotHash, finalUrl: page.url() };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Playwright failed." };
  }
}
