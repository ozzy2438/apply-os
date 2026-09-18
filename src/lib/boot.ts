import { ensureSeeded } from "@/lib/seed/ensure";

let boot: Promise<void> | null = null;

export function bootApp(): Promise<void> {
  if (!boot) boot = ensureSeeded();
  return boot;
}
