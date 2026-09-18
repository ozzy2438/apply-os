export const MELBOURNE_TZ = "Australia/Melbourne";

export function melbourneDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MELBOURNE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function nowIso(now = new Date()): string {
  return now.toISOString();
}

export function formatMelbourne(now = new Date()): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: MELBOURNE_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
}
