import { createHash } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function jobFingerprint(input: { title: string; company: string | null; url: string | null; raw: string }): string {
  const key = [
    input.title.trim().toLowerCase(),
    (input.company ?? "").trim().toLowerCase(),
    (input.url ?? "").trim().toLowerCase(),
    input.raw.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 800),
  ].join("|");
  return sha256(key);
}
