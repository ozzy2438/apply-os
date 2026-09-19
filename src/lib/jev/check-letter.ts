import { locateQuote } from "./citations";
import { citationQuestion, guardQuestions } from "./questions";
import { citationVerdict, composeCoverLetterCheck, guardResult } from "./citations";
import { getJevRuntime } from "./client";
import type { Claim, CoverLetterCheck, Profile } from "./types";
import type { ChoiceLike, NoulLike } from "./compose";
import { extractAtomicClaims } from "@/lib/claims/extract";
import { claimExplanation, letterReadyFromClaims } from "@/lib/claims/policy";
import { evidenceFromBullets } from "@/lib/policy/evidence";
import { getDecisionProvider } from "@/lib/providers/factory";
import type { CandidateEvidence, JobPosting } from "@/lib/domain/schemas";
import { normalizeJobPosting } from "@/lib/ingest/normalize";
import { scanClaimSafety } from "@/lib/canonical/claims";
import { loadCanonicalProfile } from "@/lib/canonical/load";
import { isApplicationExcludedProject } from "@/lib/canonical/claims";

function fallbackJob(profile: Profile): JobPosting {
  return normalizeJobPosting({
    id: "letter-context",
    rawText: `Title: Role\nCompany: Company\nLocation: Melbourne\n${profile.goals}`,
    sourceType: "job_posting",
  });
}

export async function checkCoverLetter(input: {
  body: string;
  claims: Claim[];
  profile: Profile;
  evidence?: CandidateEvidence[];
  job?: JobPosting;
}): Promise<CoverLetterCheck> {
  const runtime = getJevRuntime();
  const citations = [];

  for (const claim of input.claims) {
    const located = locateQuote(claim.quote, input.profile.bullets);
    if (located.status === "missing") {
      citations.push(citationVerdict(claim, input.profile.bullets, null));
      continue;
    }
    const evidence = located.bullet?.text ?? "";
    const result = await runtime.systemOne({
      state: { claim: claim.claim, section: evidence, quote: claim.quote },
      questions: citationQuestion(),
    });
    citations.push(citationVerdict(claim, input.profile.bullets, result.answers.relation as ChoiceLike));
  }

  const guardsResult = await runtime.systemOne({
    state: {
      letter: input.body,
      profile: {
        cv: input.profile.bullets,
        goals: input.profile.goals,
      },
    },
    questions: guardQuestions(),
  });

  const guards = (["inflated_tenure", "fake_production", "tools_not_in_cv"] as const).map((id) =>
    guardResult(id, guardsResult.answers[id] as NoulLike),
  );

  const base = composeCoverLetterCheck(citations, guards);
  const evidence = (input.evidence ?? evidenceFromBullets(input.profile.bullets)).filter(
    (e) => !isApplicationExcludedProject(e.sourceReference),
  );
  const job = input.job ?? fallbackJob(input.profile);
  const provider = getDecisionProvider();
  const atoms = extractAtomicClaims(input.body, input.claims);
  const atomic = [];
  for (const claim of atoms) {
    const decision = await provider.verifyClaim({ claim, candidateEvidence: evidence, job });
    const labels = evidence.filter((e) => decision.matchingEvidenceIds.includes(e.id)).map((e) => e.claim);
    atomic.push({
      text: claim.text,
      category: claim.claimCategory,
      status: decision.status,
      confidence: decision.confidence,
      requiredAction: decision.requiredAction,
      explanation: claimExplanation({ text: claim.text, decision, evidenceLabels: labels }),
      matchingEvidenceIds: decision.matchingEvidenceIds,
    });
  }
  const extra = letterReadyFromClaims(
    atomic.map((a) => ({
      status: a.status as "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED" | "AMBIGUOUS",
      confidence: a.confidence,
      matchingEvidenceIds: a.matchingEvidenceIds,
      requiredAction: a.requiredAction as "ALLOW" | "REVIEW" | "BLOCK",
    })),
    true,
  );

  let profile;
  try {
    profile = loadCanonicalProfile();
  } catch {
    profile = undefined;
  }
  const safety = scanClaimSafety(`${input.body}\n${input.claims.map((c) => c.claim).join("\n")}`, profile);
  const blockers = [...base.blockers, ...extra.blockers, ...safety];
  return {
    ...base,
    atomic,
    blockers,
    ready: base.ready && extra.ready && safety.length === 0,
  };
}
