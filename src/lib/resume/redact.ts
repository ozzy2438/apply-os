/** Strip contact details and obvious secrets before an untrusted document reaches a model. */
export function redactExistingResume(text: string): { text: string; redacted: number } {
  let n = 0;
  const next = text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, () => {
      n += 1;
      return "[redacted-email]";
    })
    .replace(/\+?\d[\d\s().-]{7,}\d/g, () => {
      n += 1;
      return "[redacted-phone]";
    })
    .replace(/\b(?:sk-|api-|Bearer\s+)[A-Za-z0-9._-]{8,}\b/g, () => {
      n += 1;
      return "[redacted-secret]";
    });
  return { text: next, redacted: n };
}
