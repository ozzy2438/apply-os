import type { ClaimVerificationDecision, StructuredJobDecision } from "@/lib/domain/schemas";
import type { DecisionProvider } from "./decision";
import { heuristicEvaluationAnswers } from "@/lib/jev/mock";
import { normalizeScore } from "@/lib/jev/compose";
import type { BrowserActionDecision } from "@/lib/browser/types";

function peaked(center: number): Record<string, number> {
  const raw = Array.from({ length: 5 }, (_, i) => Math.exp(-((i - center * 4) ** 2) / 0.72));
  const sum = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(raw.map((v, i) => [String(i), v / sum]));
}

function scored(score: number, confidence: number) {
  return { score, confidence, probabilities: peaked(score) };
}

export const demoDecisionProvider: DecisionProvider = {
  name: "DEMO",
  modelVersion: "jev-mock",
  async evaluateJob(input) {
    const answers = heuristicEvaluationAnswers({
      posting: {
        sourceType: "job_posting",
        title: input.job.title,
        company: input.job.company ?? "Unknown",
        location: input.job.location ?? "Unspecified",
        compensation: input.job.salaryMax ? `${input.job.salaryCurrency ?? ""} ${input.job.salaryMax}` : null,
        url: input.job.sourceUrl,
        rawText: input.job.descriptionRaw,
      },
      profile: {
        goals: input.candidate.targetRoles.join(", "),
        constraints: {
          workRights: input.candidate.visaConstraints.join("; ") || "Australian citizen",
          locations: input.candidate.preferredLocations,
          workMode: input.candidate.acceptedWorkplaceTypes.join(" / "),
          compensationFloorAud: input.candidate.minimumSalary.amount ?? 0,
          seniorityBand: input.candidate.seniorityTargets.join(", "),
        },
        cv: input.evidence.map((e) => ({ id: e.id, text: e.sourceText || e.claim, kind: "independent" })),
      },
    });

    const role = normalizeScore(answers.goal_alignment.score);
    const skills = normalizeScore(answers.cv_evidence.score);
    const seniority = normalizeScore(answers.seniority_fit.score);
    const strategic = (normalizeScore(answers.goal_alignment.score) + normalizeScore(answers.domain_fit.score)) / 2;
    const vague = input.job.extractionConfidence < 0.55 || input.job.descriptionRaw.length < 400;
    const rec =
      answers.action.choice === "skip"
        ? "SKIP"
        : answers.action.choice === "needs_review" || vague
          ? "REVIEW_REQUIRED"
          : "APPLY_CANDIDATE";

    const decision: StructuredJobDecision = {
      roleFit: scored(role, answers.goal_alignment.confidence),
      skillsFit: scored(skills, answers.cv_evidence.confidence),
      seniorityFit: scored(seniority, answers.seniority_fit.confidence),
      strategicValue: scored(strategic, answers.goal_alignment.confidence),
      missingInformation: { value: vague, probability: vague ? 0.72 : 0.18 },
      redFlag: {
        value: answers.work_rights.noul >= 0.8 || answers.location.noul >= 0.8,
        probability: Math.max(answers.work_rights.noul, answers.location.noul, answers.credential.noul),
      },
      recommendation: { choice: rec, confidence: answers.action.confidence },
    };
    return decision;
  },

  async verifyClaim(input) {
    const text = input.claim.text.toLowerCase();
    const matches = input.candidateEvidence.filter((e) => {
      const hay = `${e.claim} ${e.sourceText}`.toLowerCase();
      const words = text.split(/\W+/).filter((w) => w.length > 4);
      return words.filter((w) => hay.includes(w)).length >= 3;
    });
    if (/\bphd\b|green card|us citizen|10\+ years|\bproduction owners?\b/.test(text) && matches.length === 0) {
      return {
        status: "UNSUPPORTED",
        confidence: 0.91,
        matchingEvidenceIds: [],
        requiredAction: "BLOCK",
      } satisfies ClaimVerificationDecision;
    }
    if (matches.length === 0) {
      return {
        status: "AMBIGUOUS",
        confidence: 0.55,
        matchingEvidenceIds: [],
        requiredAction: "REVIEW",
      };
    }
    const overlap = matches[0];
    const partial = input.claim.claimCategory === "METRIC" && !/\d/.test(overlap.sourceText);
    if (partial) {
      return {
        status: "PARTIALLY_SUPPORTED",
        confidence: 0.74,
        matchingEvidenceIds: matches.map((m) => m.id),
        requiredAction: "REVIEW",
      };
    }
    return {
      status: "SUPPORTED",
      confidence: 0.9,
      matchingEvidenceIds: matches.map((m) => m.id),
      requiredAction: "ALLOW",
    };
  },

  async decideBrowserAction(input) {
    const { actionSpace, browserState, task } = input;
    const extractable = actionSpace.flags.pageLooksLikeJobDetail && browserState.visibleTextSummary.length > 200;
    const click = actionSpace.actions.find((a) => a.kind === "CLICK" && a.rationaleHint === "OPEN_JOB_DETAIL");
    const extractClick = actionSpace.actions.find((a) => a.kind === "CLICK" && a.rationaleHint === "EXTRACT_JOB");
    const next = actionSpace.actions.find((a) => a.kind === "CLICK" && a.rationaleHint === "CONTINUE_PAGINATION");
    const stop = actionSpace.actions.find((a) => a.kind === "STOP");

    let decision: BrowserActionDecision;
    if (task.importedJobIds.length >= task.maxJobs) {
      const action = stop ?? { kind: "STOP" as const, reason: "Import cap reached" };
      decision = {
        observationVersion: browserState.page.observationVersion,
        action,
        confidence: 0.95,
        rationaleCode: "TASK_COMPLETE",
      };
    } else if (extractable && extractClick) {
      decision = {
        observationVersion: browserState.page.observationVersion,
        action: extractClick,
        confidence: 0.88,
        rationaleCode: "EXTRACT_JOB",
      };
    } else if (click) {
      decision = {
        observationVersion: browserState.page.observationVersion,
        action: click,
        confidence: 0.84,
        rationaleCode: "OPEN_JOB_DETAIL",
      };
    } else if (next && task.allowPagination) {
      decision = {
        observationVersion: browserState.page.observationVersion,
        action: next,
        confidence: 0.8,
        rationaleCode: "CONTINUE_PAGINATION",
      };
    } else {
      decision = {
        observationVersion: browserState.page.observationVersion,
        action: stop ?? { kind: "STOP", reason: "No permitted next action" },
        confidence: 0.7,
        rationaleCode: "INSUFFICIENT_INFORMATION",
      };
    }
    return decision;
  },
};
