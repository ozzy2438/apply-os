import { readFileSync } from "node:fs";
import path from "node:path";
import type { DiscoveryBatch, DiscoveryProvider, RawDiscoveryItem } from "../types";

type FeedConfig = { id: string; url: string; format: "rss" | "json" };

function loadFeeds(): FeedConfig[] {
  try {
    const file = path.join(process.cwd(), "data", "discovery-feeds.json");
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { feeds?: FeedConfig[] };
    return parsed.feeds ?? [];
  } catch {
    return [];
  }
}

function itemsFromRss(xml: string, feedId: string): RawDiscoveryItem[] {
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  const items: RawDiscoveryItem[] = [];
  for (const block of blocks) {
    const title = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || null;
    const url = block.match(/<link>(.*?)<\/link>/i)?.[1]?.trim();
    const snippet =
      block.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/i)?.[1]?.replace(/<[^>]+>/g, " ").trim() ||
      null;
    const publishedAt = block.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1] ?? null;
    if (!url) continue;
    items.push({
      providerId: "feeds",
      live: true,
      url,
      title,
      company: null,
      location: null,
      snippet,
      publishedAt,
      author: null,
      externalId: `${feedId}:${url}`,
      raw: { feedId },
    });
  }
  return items;
}

export function createFeedProvider(fetchImpl: typeof fetch = fetch): DiscoveryProvider {
  return {
    id: "feeds",
    async discover(): Promise<DiscoveryBatch> {
      const feeds = loadFeeds();
      if (!feeds.length) {
        return { providerId: "feeds", live: false, items: [], nextCursor: null };
      }
      const items: RawDiscoveryItem[] = [];
      const errors: string[] = [];
      for (const feed of feeds) {
        try {
          const response = await fetchImpl(feed.url, { method: "GET" });
          if (!response.ok) {
            errors.push(`${feed.id}:${response.status}`);
            continue;
          }
          const body = await response.text();
          if (feed.format === "json") {
            const parsed = JSON.parse(body) as { items?: Array<{ url?: string; title?: string; snippet?: string; publishedAt?: string; company?: string }> };
            for (const row of parsed.items ?? []) {
              if (!row.url) continue;
              items.push({
                providerId: "feeds",
                live: true,
                url: row.url,
                title: row.title ?? null,
                company: row.company ?? null,
                location: null,
                snippet: row.snippet ?? null,
                publishedAt: row.publishedAt ?? null,
                author: null,
                externalId: `${feed.id}:${row.url}`,
                raw: { feedId: feed.id },
              });
            }
          } else {
            items.push(...itemsFromRss(body, feed.id));
          }
        } catch (error) {
          errors.push(`${feed.id}:${error instanceof Error ? error.message : "feed failed"}`);
        }
      }
      return {
        providerId: "feeds",
        live: items.length > 0,
        items,
        nextCursor: null,
        error: errors.length ? errors.join("; ") : undefined,
      };
    },
  };
}
