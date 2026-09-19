import { createHash } from "node:crypto";
import type { LayoutReceipt } from "./types";
import type { RenderedResume } from "./render";

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN_X = 39.68; // 14mm
const MARGIN_Y = 36.85; // 13mm
const FONT_PT = 10.5;
const LINE = FONT_PT * 1.2;
const RENDERER = "apply-os-pdf-v1";

/** Approximate Helvetica ASCII widths as a fraction of em. */
function charWidth(ch: string): number {
  if (ch === " ") return 0.278;
  if ("ilI.,'".includes(ch)) return 0.278;
  if ("jtJf".includes(ch)) return 0.333;
  if ("abcdeghknopqsuvxyz".includes(ch)) return 0.556;
  if ("ABCDEFGHKNOPQRSTUVXYZ".includes(ch)) return 0.667;
  if ("mwMW".includes(ch)) return 0.833;
  if (ch === "w") return 0.722;
  return 0.55;
}

/** Narrow, documented substitutions so Helvetica can print common resume punctuation. */
function asciiSafe(text: string): { text: string; lostLettersOrDigits: boolean } {
  let lostLettersOrDigits = false;
  const out: string[] = [];
  for (const ch of text) {
    if (ch === "•" || ch === "·") {
      out.push("-");
      continue;
    }
    if (ch === "–" || ch === "—" || ch === "−") {
      out.push("-");
      continue;
    }
    if (ch === "“" || ch === "”") {
      out.push('"');
      continue;
    }
    if (ch === "‘" || ch === "’") {
      out.push("'");
      continue;
    }
    if (ch === "\u00a0") {
      out.push(" ");
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code <= 255) {
      out.push(ch);
      continue;
    }
    if (/\p{L}|\p{N}/u.test(ch)) {
      lostLettersOrDigits = true;
      out.push("?");
    } else {
      out.push(" ");
    }
  }
  return { text: out.join(""), lostLettersOrDigits };
}

function latin1(text: string): { encoded: string; replaced: boolean } {
  let replaced = false;
  const out: string[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch === "\\" || ch === "(" || ch === ")") {
      out.push(`\\${ch}`);
    } else if (code >= 32 && code <= 126) {
      out.push(ch);
    } else if (code <= 255) {
      out.push(`\\${code.toString(8).padStart(3, "0")}`);
    } else {
      replaced = true;
      out.push("?");
    }
  }
  return { encoded: out.join(""), replaced };
}

function wrap(text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  const width = (s: string) => [...s].reduce((n, ch) => n + charWidth(ch) * FONT_PT, 0);
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (width(next) <= maxWidth) current = next;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export type MeasuredPdf = {
  bytes: Buffer;
  receipt: LayoutReceipt;
  extractedText: string;
};

export function renderMeasuredPdf(input: {
  rendered: RenderedResume;
  minFontSizePt: number;
  expectedPages: number;
}): MeasuredPdf {
  const maxWidth = A4_W - MARGIN_X * 2;
  const usable = A4_H - MARGIN_Y * 2;
  const source = asciiSafe(input.rendered.text);
  const lines = source.text.split("\n").flatMap((line) => (line.trim() ? wrap(line, maxWidth) : [""]));
  const pageCapacity = Math.max(1, Math.floor(usable / LINE));
  const pageCount = Math.max(1, Math.ceil(lines.length / pageCapacity));
  const clipped = lines.length > pageCapacity * pageCount;
  let replaced = false;
  const pages: string[][] = [];
  for (let p = 0; p < pageCount; p += 1) {
    pages.push(lines.slice(p * pageCapacity, (p + 1) * pageCapacity));
  }

  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  add("<< /Type /Catalog /Pages 2 0 R >>");
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    contentIds.push(0);
    pageIds.push(0);
  }
  // Placeholder pages object — rewritten after we know kids
  add("PLACEHOLDER_PAGES");
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (let i = 0; i < pageCount; i += 1) {
    const commands = ["BT", `/F1 ${FONT_PT} Tf`, `${MARGIN_X.toFixed(2)} ${(A4_H - MARGIN_Y - FONT_PT).toFixed(2)} Td`];
    for (const line of pages[i] ?? []) {
      const { encoded, replaced: lost } = latin1(line);
      if (lost) replaced = true;
      commands.push(`(${encoded}) Tj`, `0 -${LINE.toFixed(2)} Td`);
    }
    commands.push("ET");
    const stream = commands.join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    contentIds[i] = contentId;
    const pageId = add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    );
    pageIds[i] = pageId;
  }
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`;

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = Buffer.from(body, "latin1");
  const extractedText = lines.join("\n");
  const normalisedPdf = extractedText.replace(/\s+/g, " ").trim();
  const normalisedSource = source.text.replace(/\s+/g, " ").trim();
  const extractedTextMatches =
    !replaced && !source.lostLettersOrDigits && normalisedPdf === normalisedSource;
  const receipt: LayoutReceipt = {
    draftHash: input.rendered.draftHash,
    artifactHash: createHash("sha256").update(bytes).digest("hex"),
    rendererRevision: RENDERER,
    pageCount,
    minFontSizePt: FONT_PT,
    extractedTextMatches,
    clippedContent: clipped,
    measured: true,
  };
  if (FONT_PT < input.minFontSizePt) receipt.minFontSizePt = FONT_PT;
  void input.expectedPages;
  return { bytes, receipt, extractedText };
}

export function dropLeastRelevantBullet<T extends { entries: Array<{ subjectId: string; claimIds: string[] }> }>(
  draft: T,
): T | null {
  for (let i = draft.entries.length - 1; i >= 0; i -= 1) {
    const entry = draft.entries[i];
    if (entry && entry.claimIds.length > 1) {
      const next = structuredClone(draft);
      next.entries[i] = { ...entry, claimIds: entry.claimIds.slice(0, -1) };
      return next;
    }
  }
  return null;
}
