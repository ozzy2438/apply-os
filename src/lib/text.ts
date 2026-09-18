export function normalizeText(text: string): string {
  const table: Record<string, string> = {
    "\u201c": '"',
    "\u201d": '"',
    "\u2018": "'",
    "\u2019": "'",
  };
  return text
    .split("")
    .map((ch) => table[ch] ?? ch)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function quoteInSource(quote: string, source: string): boolean {
  const needle = normalizeText(quote);
  if (needle.length < 8) return false;
  return normalizeText(source).includes(needle);
}
