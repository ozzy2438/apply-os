/** Default closed in production. Development is enabled once module tests pass. */
export function discoveryEnabled(): boolean {
  const raw = process.env.APPLY_OS_DISCOVERY?.trim();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function discoveryModeLabel(): "off" | "dev" | "on" {
  if (!discoveryEnabled()) return "off";
  return process.env.APPLY_OS_DISCOVERY === "true" ? "on" : "dev";
}

export function exaApiKey(): string | undefined {
  const key = process.env.EXA_API_KEY?.trim() || process.env.EXA_KEY?.trim();
  return key || undefined;
}

export function exaEnabled(): boolean {
  return Boolean(exaApiKey());
}

export function allowDiscoveryFixture(): boolean {
  if (process.env.APPLY_OS_DISCOVERY_FIXTURE === "true") return true;
  if (process.env.APPLY_OS_DISCOVERY_FIXTURE === "false") return false;
  return process.env.NODE_ENV !== "production";
}
