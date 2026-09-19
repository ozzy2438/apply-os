export function ageDays(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24);
}

export function withinFreshnessWindow(
  postedAt: string | null | undefined,
  freshnessDays: number,
  now: Date,
): boolean {
  const age = ageDays(postedAt, now);
  if (age == null) return true;
  return age <= freshnessDays;
}
