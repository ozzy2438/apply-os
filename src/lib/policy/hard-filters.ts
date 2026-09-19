import type { CandidateProfile, DeterministicResults, JobPosting } from "@/lib/domain/schemas";
import type { DuplicateStatus } from "@/lib/domain/enums";

function daysBetween(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24);
}

function locationCompatible(job: JobPosting, profile: CandidateProfile): boolean | null {
  if (!job.location && !job.country) return null;
  if (job.workplaceType === "REMOTE" && profile.acceptedWorkplaceTypes.includes("REMOTE")) {
    if (job.country && !profile.workAuthorizationCountries.includes(job.country)) return false;
    return true;
  }
  const hay = `${job.location ?? ""} ${job.country ?? ""}`.toLowerCase();
  if (!hay.trim()) return null;
  return profile.preferredLocations.some((loc) => hay.includes(loc.toLowerCase()));
}

function workplaceCompatible(job: JobPosting, profile: CandidateProfile): boolean | null {
  if (job.workplaceType === "UNKNOWN") return null;
  return profile.acceptedWorkplaceTypes.includes(job.workplaceType as "REMOTE" | "HYBRID" | "ONSITE");
}

function employmentCompatible(job: JobPosting, profile: CandidateProfile): boolean | null {
  if (job.employmentType === "UNKNOWN") return null;
  return profile.acceptedEmploymentTypes.includes(job.employmentType as "FULL_TIME" | "PART_TIME" | "CONTRACT" | "CASUAL");
}

function salaryCompatible(job: JobPosting, profile: CandidateProfile): boolean | null {
  const floor = profile.minimumSalary.amount;
  if (floor == null) return null;
  const max = job.salaryMax ?? job.salaryMin;
  if (max == null) return null;
  if (job.salaryCurrency && job.salaryCurrency !== profile.minimumSalary.currency) {
    if (job.salaryCurrency === "USD" && profile.minimumSalary.currency === "AUD") {
      return max * 1.5 >= floor * 0.9;
    }
  }
  return max >= floor * 0.9;
}

function workAuthCompatible(job: JobPosting, profile: CandidateProfile): boolean | null {
  const visa = job.visaRequirements.join(" ").toLowerCase();
  const body = job.descriptionRaw.toLowerCase();
  const usOnly =
    visa.includes("us-only") ||
    /us citizen|green card|no visa sponsorship|united states only/.test(body);
  const auOk = /australian citizen|right to work in australia|australia/.test(body) || job.country === "AU";
  if (usOnly && profile.workAuthorizationCountries.includes("AU") && !auOk) return false;
  if (job.country && !profile.workAuthorizationCountries.includes(job.country) && job.workplaceType === "ONSITE") {
    return false;
  }
  if (!job.country && !visa && !usOnly) return null;
  return true;
}

function roleExcluded(job: JobPosting, profile: CandidateProfile): boolean {
  const title = job.title.toLowerCase();
  return profile.excludedRoles.some((role) => title.includes(role.toLowerCase()));
}

function redFlagHit(job: JobPosting, profile: CandidateProfile): boolean {
  const hay = `${job.title}\n${job.descriptionRaw}`.toLowerCase();
  return profile.explicitRedFlags.some((flag) => hay.includes(flag.toLowerCase()));
}

export function runHardFilters(input: {
  job: JobPosting;
  profile: CandidateProfile;
  duplicateStatus: DuplicateStatus;
  now?: Date;
}): DeterministicResults {
  const now = input.now ?? new Date();
  const ageDays = daysBetween(input.job.postedAt, now);
  const isRecent = ageDays == null ? true : ageDays <= input.profile.maxJobAgeDays;
  const closedOrExpired =
    input.job.status === "CLOSED" ||
    Boolean(
      input.job.applicationDeadline && new Date(input.job.applicationDeadline).getTime() < now.getTime(),
    );

  const loc = locationCompatible(input.job, input.profile);
  const work = workplaceCompatible(input.job, input.profile);
  const salary = salaryCompatible(input.job, input.profile);
  const auth = workAuthCompatible(input.job, input.profile);
  const emp = employmentCompatible(input.job, input.profile);
  const notExcluded = !roleExcluded(input.job, input.profile);
  const flag = redFlagHit(input.job, input.profile);

  const hardBlockers: string[] = [];
  if (!isRecent) hardBlockers.push("Job is older than the configured maximum age.");
  if (closedOrExpired) hardBlockers.push("Job is closed or past its deadline.");
  if (input.duplicateStatus === "DUPLICATE") hardBlockers.push("Exact duplicate of an already imported job.");
  if (!notExcluded) hardBlockers.push("Role matches an excluded title or programme.");
  if (loc === false) hardBlockers.push("Location is incompatible with preferred locations.");
  if (work === false) hardBlockers.push("Workplace type is outside accepted modes.");
  if (salary === false) hardBlockers.push("Stated pay is clearly below the compensation floor.");
  if (auth === false) hardBlockers.push("Work authorization / country requirements are incompatible.");
  if (emp === false) hardBlockers.push("Employment type is outside accepted types.");
  if (flag) hardBlockers.push("Posting matches an explicit user red flag.");

  return {
    isRecent,
    locationCompatible: loc,
    workplaceCompatible: work,
    salaryCompatible: salary,
    workAuthorizationCompatible: auth,
    employmentTypeCompatible: emp,
    roleNotExcluded: notExcluded,
    duplicateStatus: input.duplicateStatus,
    closedOrExpired,
    redFlagHit: flag,
    hardBlockers,
  };
}

export function hasHardBlocker(results: DeterministicResults): boolean {
  return results.hardBlockers.length > 0;
}
