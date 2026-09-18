import type { EvaluationAnswers } from "./compose";
import { composeEvaluation } from "./compose";
import { getJevRuntime } from "./client";
import { evaluationQuestions } from "./questions";
import type { ComposedEvaluation, EvaluationState, Weights } from "./types";
import { DEFAULT_WEIGHTS } from "./questions";

export async function evaluateOpportunity(
  state: EvaluationState,
  weights: Weights = DEFAULT_WEIGHTS,
): Promise<{
  model: string;
  demo: boolean;
  answers: EvaluationAnswers;
  composed: ComposedEvaluation;
}> {
  const runtime = getJevRuntime();
  const questions = evaluationQuestions();
  const result = await runtime.systemOne({
    state: JSON.parse(JSON.stringify(state)),
    questions,
  });
  const answers = result.answers as unknown as EvaluationAnswers;
  return {
    model: result.model,
    demo: runtime.demo,
    answers,
    composed: composeEvaluation(answers, weights),
  };
}
