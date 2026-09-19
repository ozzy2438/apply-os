const PAID = new Set(["contract", "freelance"]);
const INDEPENDENT = new Set(["independent", "portfolio"]);

export function deriveCommercialEvidence(
  engagementTypes: string[],
): boolean | "unknown" {
  if (engagementTypes.some((t) => PAID.has(t))) return true;
  if (engagementTypes.length > 0 && engagementTypes.every((t) => INDEPENDENT.has(t))) return false;
  return "unknown";
}

export function sameCommercialEvidence(a: boolean | "unknown", b: boolean | "unknown"): boolean {
  return a === b;
}
