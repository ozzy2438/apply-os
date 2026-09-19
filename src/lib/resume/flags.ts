/** Default closed in production. Development is enabled once module tests pass. */
export function resumeStudioEnabled(): boolean {
  const raw = process.env.APPLY_OS_RESUME_STUDIO?.trim();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function resumeStudioModeLabel(): "off" | "dev" | "on" {
  if (!resumeStudioEnabled()) return "off";
  return process.env.APPLY_OS_RESUME_STUDIO === "true" ? "on" : "dev";
}
