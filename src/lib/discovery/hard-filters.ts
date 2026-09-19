import { runHardFilters } from "@/lib/policy/hard-filters";
import type { CandidateProfile, DeterministicResults, JobPosting } from "@/lib/domain/schemas";
import type { DuplicateStatus } from "@/lib/domain/enums";

/**
 * Discovery must not treat Australia-wide remote or a soft location preference
 * as a hard reject. Permanent relocation / non-AU onsite still fail.
 */
export function runDiscoveryHardFilters(input: {
  job: JobPosting;
  profile: CandidateProfile;
  duplicateStatus: DuplicateStatus;
  now?: Date;
}): DeterministicResults {
  const result = runHardFilters(input);
  const job = input.job;
  const remoteAu =
    job.workplaceType === "REMOTE" && (job.country === "AU" || job.country == null || job.country === "Australia");
  const unknownLocation = !job.location && !job.country;
  const onsiteOutsideAu = job.workplaceType === "ONSITE" && Boolean(job.country) && job.country !== "AU";
  const relocate =
    /permanent relocation|relocate (to |outside )|must relocate/.test(`${job.title}\n${job.descriptionRaw}`.toLowerCase()) &&
    !/victoria|melbourne/.test(`${job.location ?? ""} ${job.descriptionRaw}`.toLowerCase());

  if (onsiteOutsideAu || relocate) return result;

  const locationBlocker = "Location is incompatible with preferred locations.";
  if (result.hardBlockers.includes(locationBlocker) && (remoteAu || unknownLocation || !onsiteOutsideAu)) {
    return {
      ...result,
      locationCompatible: remoteAu ? true : result.locationCompatible,
      hardBlockers: result.hardBlockers.filter((b) => b !== locationBlocker),
    };
  }
  return result;
}
