import { randomUUID } from "node:crypto";
import type { ComposedEvaluation, Profile, SourceType } from "@/lib/jev/types";
import { DIMENSION_IDS, GATE_IDS } from "@/lib/jev/types";
import { normalizeJobPosting } from "./normalize";
import { classifyDuplicate } from "./duplicates";
import { runHardFilters } from "@/lib/policy/hard-filters";
import { explanationFromEvaluation } from "@/lib/policy/compose";
import { nextAfterEvaluation } from "@/lib/policy/state-machine";
import { toV1Status } from "@/lib/domain/mapping";
import { getDecisionProvider } from "@/lib/providers/factory";
import { POLICY_VERSION } from "@/lib/policy/version";
import { DEFAULT_WEIGHTS } from "@/lib/jev/questions";
import {
  getCanonicalJob,
  insertAudit,
  insertRawImport,
  latestJobEvaluationV2,
  listCanonicalJobs,
  saveCanonicalJob,
  saveJobEvaluationV2,
  getCandidateRules,
  listEvidence,
} from "@/lib/db/store-extended";
import { insertEvaluation, insertOpportunity, updateOpportunityStatus } from "@/lib/db/store";
import { evaluateOpportunity } from "@/lib/jev/evaluate";
import { suggestedStatus } from "@/lib/jev/compose";
import type { JobEvaluation, JobPosting } from "@/lib/domain/schemas";
import { evaluateCanonicalJob } from "@/lib/canonical/evaluate";

function lightweightComposed(evaluation: JobEvaluation): ComposedEvaluation {
  const skip = evaluation.finalDecision === "SKIP";
  const review = evaluation.finalDecision === "REVIEW_REQUIRED";
  const action = skip ? "skip" : review ? "needs_review" : "apply_now";
  return {
    gates: GATE_IDS.map((id) => ({ id, noul: skip ? 0.85 : 0.1, outcome: skip ? "fail" : "pass" })),
    hardFail: skip && evaluation.deterministicResults.hardBlockers.length > 0,
    gateReview: review,
    dimensions: DIMENSION_IDS.map((id) => ({
      id,
      score: (evaluation.roleFit ?? evaluation.finalFitScore) * 4,
      normalized: evaluation.roleFit ?? evaluation.finalFitScore,
      confidence: evaluation.decisionConfidence ?? 0.7,
      weight: DEFAULT_WEIGHTS[id],
      probabilities: {},
    })),
    fit: evaluation.finalFitScore,
    action,
    actionConfidence: evaluation.decisionConfidence ?? 0.7,
    actionProbabilities: { [action]: 1 },
    confidenceBand: review ? "medium" : skip ? "high" : "high",
    deskEligible: evaluation.finalDecision === "APPLY_CANDIDATE",
    rankingScore: evaluation.priorityScore ?? evaluation.finalFitScore,
    label: evaluation.triage ?? evaluation.finalDecision,
  };
}

export async function ingestCanonical(input: {
  rawText: string;
  url?: string | null;
  sourceType: SourceType;
  profile: Profile;
  existingId?: string;
}): Promise<{
  job: JobPosting;
  evaluation: JobEvaluation;
  opportunityId: string;
  explanation: string;
}> {
  await insertRawImport({ source: input.sourceType, url: input.url ?? null, rawText: input.rawText });
  const id = input.existingId ?? randomUUID();
  const job = normalizeJobPosting({
    id,
    rawText: input.rawText,
    url: input.url,
    sourceType: input.sourceType,
  });

  const existing = await listCanonicalJobs();
  const duplicateStatus = classifyDuplicate(job, existing);
  const rules = await getCandidateRules();
  const evidence = await listEvidence();
  const deterministic = runHardFilters({ job, profile: rules, duplicateStatus });
  const previous = await latestJobEvaluationV2(job.id);
  const canonical = await evaluateCanonicalJob({
    job,
    rules,
    deterministic,
    previous,
    dbEvidence: evidence,
  });
  const evaluation = canonical.evaluation;
  const provider = getDecisionProvider();

  job.status = nextAfterEvaluation(evaluation.finalDecision);
  if (job.extractionConfidence < 0.5 && job.status === "APPLY_CANDIDATE") {
    job.status = "REVIEW_REQUIRED";
    evaluation.finalDecision = "REVIEW_REQUIRED";
    evaluation.explanationReasons.push("Extraction confidence is too low to auto-route as apply.");
  }

  const already = await getCanonicalJob(job.id);
  if (!already) {
    await insertOpportunity({
      id: job.id,
      sourceType: input.sourceType,
      title: job.title,
      company: job.company ?? "Unknown company",
      location: job.location ?? "Unspecified",
      compensation: job.salaryMax ? `${job.salaryCurrency ?? ""} ${job.salaryMax}` : null,
      url: job.sourceUrl,
      rawText: job.descriptionRaw,
      status: toV1Status(job.status),
    });
  }

  await saveCanonicalJob(job);
  if (!canonical.reusedCache) await saveJobEvaluationV2(evaluation);

  let v1Composed = lightweightComposed(evaluation);
  if (canonical.deepReviewRan && !canonical.reusedCache) {
    const v1 = await evaluateOpportunity(
      {
        posting: {
          sourceType: input.sourceType,
          title: job.title,
          company: job.company ?? "Unknown",
          location: job.location ?? "Unspecified",
          compensation: job.salaryMax ? `${job.salaryCurrency ?? ""} ${job.salaryMax}` : null,
          url: job.sourceUrl,
          rawText: job.descriptionRaw,
        },
        profile: {
          goals: input.profile.goals,
          constraints: input.profile.constraints,
          cv: input.profile.bullets,
        },
      },
      input.profile.weights,
    );
    v1Composed = v1.composed;
    await insertEvaluation({
      opportunityId: job.id,
      model: v1.model,
      demo: v1.demo,
      answers: v1.answers,
      composed: v1.composed,
    });
  } else if (!canonical.reusedCache) {
    await insertEvaluation({
      opportunityId: job.id,
      model: provider.modelVersion,
      demo: provider.name === "DEMO",
      answers: {},
      composed: v1Composed,
    });
  }

  const routed = toV1Status(job.status);
  const v1Suggest = suggestedStatus(v1Composed);
  const status = routed === "skipped" || v1Suggest === "skipped" ? "skipped" : routed;
  if (status !== "inbox") {
    await updateOpportunityStatus(job.id, status, "policy+Jev route");
  }

  await insertAudit({
    userId: "default",
    jobId: job.id,
    eventType: "JOB_EVALUATED",
    profileVersion: rules.version,
    policyVersion: POLICY_VERSION,
    modelProvider: provider.name === "DEMO" ? "DEMO" : "JEV",
    modelVersion: evaluation.jevModelVersion ?? provider.modelVersion,
    inputHash: evaluation.jobInputHash ?? null,
    observationVersion: null,
    decisionSummary: {
      finalDecision: evaluation.finalDecision,
      finalFitScore: evaluation.finalFitScore,
      recommendation: evaluation.semanticSignals.recommendation,
      triage: evaluation.triage,
      roleFit: evaluation.roleFit,
      evidenceCoverage: evaluation.evidenceCoverage,
      informationCompleteness: evaluation.informationCompleteness,
      decisionConfidence: evaluation.decisionConfidence,
      priorityScore: evaluation.priorityScore,
      candidateProfileVersion: evaluation.candidateProfileVersionLabel,
      decisionPolicyVersion: evaluation.decisionPolicyVersion,
      evaluationSchemaVersion: evaluation.evaluationSchemaVersion,
      reusedCache: canonical.reusedCache,
      deepReviewRan: canonical.deepReviewRan,
    },
    policyResult: { ...evaluation.deterministicResults, triage: evaluation.triage },
    executionResult: { explanation: explanationFromEvaluation(evaluation) },
  });

  return { job, evaluation, opportunityId: job.id, explanation: explanationFromEvaluation(evaluation) };
}

export async function evaluationForJob(jobId: string): Promise<JobEvaluation | null> {
  return latestJobEvaluationV2(jobId);
}

export async function backfillCanonicalForOpportunity(input: {
  id: string;
  rawText: string;
  url: string | null;
  sourceType: SourceType;
  title: string;
  company: string;
}): Promise<void> {
  if (await getCanonicalJob(input.id)) return;
  const job = normalizeJobPosting({
    id: input.id,
    rawText: input.rawText,
    url: input.url,
    sourceType: input.sourceType,
  });
  job.title = input.title;
  job.company = input.company;
  const existing = await listCanonicalJobs();
  const duplicateStatus = classifyDuplicate(job, existing);
  const rules = await getCandidateRules();
  const evidence = await listEvidence();
  const deterministic = runHardFilters({ job, profile: rules, duplicateStatus });
  const canonical = await evaluateCanonicalJob({
    job,
    rules,
    deterministic,
    previous: await latestJobEvaluationV2(job.id),
    dbEvidence: evidence,
  });
  job.status = nextAfterEvaluation(canonical.evaluation.finalDecision);
  await saveCanonicalJob(job);
  if (!canonical.reusedCache) await saveJobEvaluationV2(canonical.evaluation);
}
