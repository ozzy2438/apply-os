import { APPLICATION_EXCLUDED_PROJECTS, type CanonicalProfile } from "./types";

export function isApplicationExcludedProject(projectId: string): boolean {
  return (APPLICATION_EXCLUDED_PROJECTS as readonly string[]).includes(projectId);
}

const INDEPENDENT_PRODUCTS = [
  "equitylens",
  "procurelens",
  "voltdesk",
  "fuelsignal",
  "decisionflow",
  "casemix",
  "obligationiq",
];

const CLIENT_UPGRADE = /delivered to|commissioned by|used by a client|client engagement|paid client|consultancy-style|contract-style|freelance-style/;

const REALISED_REVENUE = /realised revenue|realized revenue|live client (revenue|impact)|production ownership/;
const QUALIFIER = /modelled|modeled|simulated|backtest|controlled validation|synthetic|held-out|walk-forward/;

export function scanClaimSafety(text: string, profile?: CanonicalProfile): string[] {
  const blockers: string[] = [];
  const hay = text.toLowerCase();

  if (/p02|hospital capacity|auc-roc 1\.0000|99\.94%\s*recall|zero false alarms/.test(hay)) {
    blockers.push("P02 Hospital Capacity metrics cannot enter generated application evidence.");
  }
  if (INDEPENDENT_PRODUCTS.some((name) => hay.includes(name)) && CLIENT_UPGRADE.test(hay)) {
    blockers.push("Independent project cannot be presented as client work.");
  }
  if (/\b(i led a team of|line manager|direct reports|people manager)\b/.test(hay) && !/workstream|delivery leadership/.test(hay)) {
    blockers.push("Line management is a forbidden claim; only workstream leadership is evidenced.");
  }
  if (/\$|a\$|gbp/.test(hay) && REALISED_REVENUE.test(hay) && !QUALIFIER.test(hay)) {
    blockers.push("Simulated or modelled result is missing its required qualifier.");
  }
  if (profile) {
    for (const item of profile.claim_policy.forbidden_claims) {
      const needle = item.claim.toLowerCase().slice(0, 48);
      if (needle.length > 20 && hay.includes(needle.slice(0, 28))) {
        blockers.push(`Forbidden claim: ${item.claim}`);
      }
    }
    for (const proj of profile.projects) {
      if (proj.engagement_type !== "independent" && proj.engagement_type !== "portfolio") continue;
      if (hay.includes(proj.name.toLowerCase()) && CLIENT_UPGRADE.test(hay)) {
        blockers.push(`Independent project ${proj.project_id} cannot be presented as client work.`);
      }
    }
  }
  return [...new Set(blockers)];
}

export function qualifierForClaim(claim: string, profile: CanonicalProfile): string | null {
  const hit = profile.claim_policy.qualified_claims.find((q) =>
    claim.toLowerCase().includes(q.claim.toLowerCase().slice(0, 24)),
  );
  return hit?.required_qualification ?? null;
}

export function applicationSafeProjectIds(profile: CanonicalProfile): string[] {
  return profile.projects
    .filter((p) => p.cv_usage !== "excluded" && !isApplicationExcludedProject(p.project_id))
    .map((p) => p.project_id);
}
