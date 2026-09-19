import type { GenerationProvider, GeneratedLetter } from "./generation";

export const demoGenerationProvider: GenerationProvider = {
  name: "DEMO",
  async draftCoverLetter(input) {
    const picked = input.evidence.filter((e) => e.verified).slice(0, 3);
    const claims = picked.map((e) => ({
      claim: e.claim.endsWith(".") ? e.claim : `${e.claim}.`,
      evidenceId: e.id,
      quote: e.sourceText || e.claim,
    }));
    const body = [
      `Hello ${input.job.company ?? "hiring"} team,`,
      "",
      `I'm applying for ${input.job.title}. Tone: ${input.tone}. I will only cite verified evidence.`,
      "",
      ...claims.map((c, i) => `${i + 1}. ${c.claim}`),
      "",
      "I would rather under-claim than invent live enterprise operation.",
      "",
      "Kind regards",
    ]
      .join("\n")
      .split(/\s+/)
      .slice(0, input.maxWords)
      .join(" ")
      .replace(/Kind regards$/, "\n\nKind regards");

    const letter: GeneratedLetter = { body, claims, source: "demo" };
    return letter;
  },
  async draftRecruiterMessage(input) {
    const skill = input.evidence.find((e) => e.verified)?.claim ?? "relevant independent work";
    return {
      body: `Thanks for reaching out about ${input.job.title}. I'm based in Melbourne and looking for ${input.candidate.targetRoles[0] ?? "a data role"} with evidence I can stand behind — for example: ${skill}. Happy to talk if you can share the location, work rights, and band.`,
      source: "demo",
    };
  },
  async summarizeJob(input) {
    return `${input.job.title} at ${input.job.company ?? "an unnamed company"} (${input.job.location ?? "location unknown"}, ${input.job.workplaceType.toLowerCase()}). Extraction confidence ${Math.round(input.job.extractionConfidence * 100)}%.`;
  },
  async draftApplicationAnswer(input) {
    const ev = input.evidence.find((e) => e.verified);
    if (!ev) return "I would rather discuss this live than invent an answer I cannot evidence.";
    return `From verified evidence: ${ev.claim}`;
  },
};
