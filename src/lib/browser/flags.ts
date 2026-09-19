import { isDemoMode } from "@/lib/jev/client";

export function browserAssistFlag(): boolean {
  return process.env.APPLY_OS_BROWSER_ASSIST === "true";
}

export function liveBrowserAllowed(): boolean {
  return browserAssistFlag() && !isDemoMode();
}

export function browserModeLabel(): "off" | "demo-simulated" | "live-assist" {
  if (isDemoMode()) return "demo-simulated";
  if (browserAssistFlag()) return "live-assist";
  return "off";
}
