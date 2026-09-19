import { readFileSync } from "node:fs";
import path from "node:path";
import type { ResumePolicy } from "./types";
import { assertPolicy } from "./validation";
import { weightsFor } from "./weights";
import { hash } from "./identity";

type PolicyFile = Omit<ResumePolicy, "weights" | "notApplicableDimensions"> & {
  weights: ResumePolicy["weights"];
  notApplicableDimensions?: ResumePolicy["notApplicableDimensions"];
};

let cached: PolicyFile | null = null;

function loadPolicyFile(): PolicyFile {
  if (cached) return cached;
  const file = path.join(process.cwd(), "data", "resume-policy.json");
  cached = JSON.parse(readFileSync(file, "utf8")) as PolicyFile;
  return cached;
}

export const RESUME_POLICY_VERSION = "1.0.0";
export const WRITER_PROMPT_VERSION = "resume-writer-1.0.0";

export function loadResumePolicy(roleFamilyId: string): { policy: ResumePolicy; warnings: string[] } {
  const base = loadPolicyFile();
  const { weights, warning } = weightsFor(roleFamilyId);
  const policy: ResumePolicy = {
    ...base,
    weights,
    notApplicableDimensions: base.notApplicableDimensions ?? [],
  };
  assertPolicy(policy);
  return { policy, warnings: warning ? [warning] : [] };
}

export function resumePolicyHash(policy: ResumePolicy): string {
  return hash(policy);
}

export function resetResumePolicyCache(): void {
  cached = null;
}
