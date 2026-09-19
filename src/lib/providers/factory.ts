import { isDemoMode } from "@/lib/jev/client";
import type { DecisionProvider } from "./decision";
import type { GenerationProvider } from "./generation";
import { createJevDecisionProvider } from "./jev-decision";
import { createGenerationProvider } from "./openai-generation";
import { demoDecisionProvider } from "./demo-decision";
import { demoGenerationProvider } from "./demo-generation";

export function getDecisionProvider(): DecisionProvider {
  return isDemoMode() ? demoDecisionProvider : createJevDecisionProvider();
}

export function getGenerationProvider(): GenerationProvider {
  return createGenerationProvider();
}

export function getDemoProviders(): { decision: DecisionProvider; generation: GenerationProvider } {
  return { decision: demoDecisionProvider, generation: demoGenerationProvider };
}
