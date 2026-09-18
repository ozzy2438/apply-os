import { locateQuote } from "./citations";
import { citationQuestion, guardQuestions } from "./questions";
import { citationVerdict, composeCoverLetterCheck, guardResult } from "./citations";
import { getJevRuntime } from "./client";
import type { Claim, CoverLetterCheck, Profile } from "./types";
import type { ChoiceLike, NoulLike } from "./compose";

export async function checkCoverLetter(input: {
  body: string;
  claims: Claim[];
  profile: Profile;
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

  return composeCoverLetterCheck(citations, guards);
}
