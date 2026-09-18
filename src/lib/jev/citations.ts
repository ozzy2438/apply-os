import type { ChoiceLike, NoulLike } from "./compose";
import { THRESHOLDS } from "./questions";
import type {
  CitationResult,
  CitationVerdict,
  Claim,
  CoverLetterCheck,
  CvBullet,
  GuardId,
  GuardResult,
} from "./types";
import { quoteInSource } from "@/lib/text";

const RELATION_TO_VERDICT: Record<string, CitationVerdict> = {
  supports: "verified",
  contradicts: "contradicted",
  says_nothing: "unsupported",
};

export function locateQuote(
  quote: string,
  bullets: CvBullet[],
): { status: CitationResult["status"]; bullet: CvBullet | undefined } {
  if (!quote.trim()) return { status: "missing", bullet: undefined };
  const bullet = bullets.find((b) => quoteInSource(quote, b.text));
  if (!bullet) return { status: "missing", bullet: undefined };
  return { status: "found", bullet };
}

export function citationVerdict(
  claim: Claim,
  bullets: CvBullet[],
  answer: ChoiceLike | null,
): CitationResult {
  const { status } = locateQuote(claim.quote, bullets);
  if (status === "missing") {
    return {
      claim,
      status,
      relation: null,
      confidence: null,
      verdict: "fabricated",
      auto: true,
    };
  }
  if (!answer) {
    return {
      claim,
      status,
      relation: null,
      confidence: null,
      verdict: "unsupported",
      auto: false,
    };
  }
  const verdict = RELATION_TO_VERDICT[answer.choice] ?? "unsupported";
  const confidence = answer.confidence;
  return {
    claim,
    status,
    relation: (answer.choice as CitationResult["relation"]) ?? "says_nothing",
    confidence,
    verdict,
    auto: confidence >= THRESHOLDS.citationAuto,
  };
}

export function guardResult(id: GuardId, answer: NoulLike): GuardResult {
  return {
    id,
    noul: answer.noul,
    failed: answer.noul >= THRESHOLDS.guardFail,
  };
}

export function composeCoverLetterCheck(
  citations: CitationResult[],
  guards: GuardResult[],
): CoverLetterCheck {
  const blockers: string[] = [];
  for (const c of citations) {
    if (c.verdict === "fabricated") blockers.push(`Fabricated quote: “${c.claim.claim}”`);
    if (c.verdict === "contradicted") blockers.push(`Contradicted claim: “${c.claim.claim}”`);
    if (!c.auto && c.verdict !== "fabricated") {
      blockers.push(`Unresolved citation (low confidence): “${c.claim.claim}”`);
    }
  }
  for (const g of guards) {
    if (g.failed) blockers.push(`Guardrail failed: ${g.id.replaceAll("_", " ")}`);
  }
  return {
    citations,
    guards,
    ready: blockers.length === 0 && citations.length > 0,
    blockers,
  };
}
