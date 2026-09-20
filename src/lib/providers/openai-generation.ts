import OpenAI from "openai";
import { demoGenerationProvider } from "./demo-generation";
import type { GeneratedLetter, GenerationProvider } from "./generation";

function extractJson(text: string): GeneratedLetter | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { body?: string; claims?: GeneratedLetter["claims"] };
    if (!parsed.body || !Array.isArray(parsed.claims) || parsed.claims.length === 0) return null;
    return {
      body: parsed.body,
      claims: parsed.claims.map((c) => ({
        claim: String(c.claim ?? ""),
        evidenceId: String(c.evidenceId ?? ""),
        quote: String(c.quote ?? ""),
      })),
      source: "llm",
    };
  } catch {
    return null;
  }
}

export function createGenerationProvider(): GenerationProvider {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || process.env.NETLIFY_OPENAI_API_KEY?.trim();
  if (!apiKey) return demoGenerationProvider;

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  return {
    name: "OPENAI",
    async draftCoverLetter(input) {
      const fallback = await demoGenerationProvider.draftCoverLetter(input);
      try {
        const completion = await client.chat.completions.create({
          model,
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Draft a conservative cover letter. Never invent achievements, metrics, employers, visas, degrees, or years. Return JSON only.",
            },
            {
              role: "user",
              content: JSON.stringify({
                job: { title: input.job.title, company: input.job.company, text: input.job.descriptionRaw.slice(0, 4000) },
                goals: input.candidate.targetRoles,
                evidence: input.evidence.filter((e) => e.verified),
                tone: input.tone,
                maxWords: input.maxWords,
                schema: { body: "string", claims: [{ claim: "string", evidenceId: "string", quote: "exact evidence substring" }] },
              }),
            },
          ],
        });
        const parsed = extractJson(completion.choices[0]?.message?.content ?? "");
        return parsed ?? fallback;
      } catch {
        return fallback;
      }
    },
    async draftRecruiterMessage(input) {
      return demoGenerationProvider.draftRecruiterMessage(input);
    },
    async summarizeJob(input) {
      return demoGenerationProvider.summarizeJob(input);
    },
    async draftApplicationAnswer(input) {
      return demoGenerationProvider.draftApplicationAnswer(input);
    },
  };
}

export function getDecisionAndGeneration() {
  return {
    generation: createGenerationProvider(),
  };
}
