"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bootApp } from "@/lib/boot";
import { resumeStudioEnabled } from "@/lib/resume/flags";
import {
  approveResumeForJob,
  buildResumeForJob,
  recordResumeIntent,
  reviewExistingResumeForJob,
} from "@/lib/resume/service";

function refresh(jobId: string) {
  revalidatePath(`/opportunities/${jobId}`);
  revalidatePath(`/opportunities/${jobId}/resume`);
  revalidatePath("/audit");
}

export async function buildResumeAction(jobId: string): Promise<void> {
  await bootApp();
  if (!resumeStudioEnabled()) return;
  await buildResumeForJob(jobId, true);
  refresh(jobId);
  redirect(`/opportunities/${jobId}/resume`);
}

export async function skipResumeAction(jobId: string): Promise<void> {
  await bootApp();
  if (!resumeStudioEnabled()) return;
  await recordResumeIntent(jobId, "skip");
  refresh(jobId);
}

export async function selfPrepareResumeAction(jobId: string): Promise<void> {
  await bootApp();
  if (!resumeStudioEnabled()) return;
  await recordResumeIntent(jobId, "self");
  refresh(jobId);
}

export async function reviewExistingResumeAction(jobId: string, formData: FormData): Promise<void> {
  await bootApp();
  if (!resumeStudioEnabled()) return;
  const text = String(formData.get("existingResume") || "").trim();
  if (!text) return;
  await reviewExistingResumeForJob(jobId, text);
  refresh(jobId);
  redirect(`/opportunities/${jobId}/resume`);
}

export async function approveResumeAction(jobId: string, formData: FormData): Promise<void> {
  await bootApp();
  if (!resumeStudioEnabled()) return;
  const accepted = String(formData.get("acceptedWarnings") || "") === "on";
  await approveResumeForJob(jobId, accepted);
  refresh(jobId);
}

export async function rebuildResumeAction(jobId: string): Promise<void> {
  await buildResumeAction(jobId);
}
