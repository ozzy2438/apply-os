import { choice, noul, score } from "@typesafe-ai/sdk";
import type { DecisionProvider } from "./decision";
import { getJevRuntime } from "@/lib/jev/client";
import { SCORE_LEVELS } from "@/lib/jev/questions";
import { demoDecisionProvider } from "./demo-decision";
import { normalizeScore } from "@/lib/jev/compose";
import type { StructuredJobDecision } from "@/lib/domain/schemas";
import type { ChoiceLike, NoulLike, ScoreLike } from "@/lib/jev/compose";

function jobQuestions() {
  return {
    role_fit: score("How strongly do the normalized role title and responsibilities align with the user's target roles?", SCORE_LEVELS),
    skills_fit: score(
      "How strongly do the job's required and preferred skills align with the candidate's verified skills and evidence?",
      SCORE_LEVELS,
    ),
    seniority_fit: score("How compatible is the seniority level with the candidate's configured target levels?", SCORE_LEVELS),
    strategic_value: score("How valuable is this role for the user's stated career direction?", SCORE_LEVELS),
    missing_information: noul("Is there too little information to make a safe application recommendation?"),
    red_flag: noul("Does the job contain a likely user-configured red flag or incompatible constraint?"),
    recommendation: choice(
      "Given the candidate profile, job, hard-filter results, and scoring rubric, how should this job be routed?",
      {
        APPLY_CANDIDATE: "No hard blocker, enough evidence, worth pursuing.",
        REVIEW_REQUIRED: "Ambiguity, missing fields, or mixed signals.",
        SKIP: "Clear mismatch — do not spend time.",
      },
    ),
  };
}

function claimQuestion() {
  return {
    relation: choice("How does the candidate evidence relate to this atomic claim?", {
      SUPPORTED: "Verified evidence states or directly implies the claim.",
      PARTIALLY_SUPPORTED: "Evidence overlaps but the claim overreaches.",
      UNSUPPORTED: "No evidence supports the claim, or evidence contradicts it.",
      AMBIGUOUS: "Not enough information to decide.",
    }),
  };
}

export function createJevDecisionProvider(): DecisionProvider {
  const runtime = getJevRuntime();
  if (runtime.demo) return demoDecisionProvider;

  return {
    name: "JEV",
    modelVersion: runtime.model,
    async evaluateJob(input) {
      const result = await runtime.systemOne({
        state: JSON.parse(
          JSON.stringify({
            candidate: input.candidate,
            evidence: input.evidence.map((e) => ({ id: e.id, claim: e.claim, skills: e.skills, verified: e.verified })),
            job: input.job,
            policyContext: input.policyContext,
          }),
        ),
        questions: jobQuestions(),
      });
      const a = result.answers as unknown as {
        role_fit: ScoreLike;
        skills_fit: ScoreLike;
        seniority_fit: ScoreLike;
        strategic_value: ScoreLike;
        missing_information: NoulLike;
        red_flag: NoulLike;
        recommendation: ChoiceLike;
      };
      const rec = a.recommendation.choice;
      const choiceSafe =
        rec === "APPLY_CANDIDATE" || rec === "REVIEW_REQUIRED" || rec === "SKIP" ? rec : "REVIEW_REQUIRED";
      const decision: StructuredJobDecision = {
        roleFit: {
          score: normalizeScore(a.role_fit.score),
          confidence: a.role_fit.confidence,
          probabilities: { ...a.role_fit.probabilities },
        },
        skillsFit: {
          score: normalizeScore(a.skills_fit.score),
          confidence: a.skills_fit.confidence,
          probabilities: { ...a.skills_fit.probabilities },
        },
        seniorityFit: {
          score: normalizeScore(a.seniority_fit.score),
          confidence: a.seniority_fit.confidence,
          probabilities: { ...a.seniority_fit.probabilities },
        },
        strategicValue: {
          score: normalizeScore(a.strategic_value.score),
          confidence: a.strategic_value.confidence,
          probabilities: { ...a.strategic_value.probabilities },
        },
        missingInformation: { value: a.missing_information.noul >= 0.6, probability: a.missing_information.noul },
        redFlag: { value: a.red_flag.noul >= 0.8, probability: a.red_flag.noul },
        recommendation: { choice: choiceSafe, confidence: a.recommendation.confidence },
      };
      return decision;
    },
    async verifyClaim(input) {
      const result = await runtime.systemOne({
        state: JSON.parse(
          JSON.stringify({
            claim: input.claim,
            evidence: input.candidateEvidence,
            job: { title: input.job.title, company: input.job.company },
          }),
        ),
        questions: claimQuestion(),
      });
      const rel = result.answers.relation as ChoiceLike;
      const status =
        rel.choice === "SUPPORTED" ||
        rel.choice === "PARTIALLY_SUPPORTED" ||
        rel.choice === "UNSUPPORTED" ||
        rel.choice === "AMBIGUOUS"
          ? rel.choice
          : "AMBIGUOUS";
      const requiredAction = status === "UNSUPPORTED" ? "BLOCK" : status === "SUPPORTED" ? "ALLOW" : "REVIEW";
      return {
        status,
        confidence: rel.confidence,
        matchingEvidenceIds: input.candidateEvidence.slice(0, 3).map((e) => e.id),
        requiredAction,
      };
    },
    async decideBrowserAction(input) {
      return demoDecisionProvider.decideBrowserAction(input);
    },
  };
}
