import OpenAI from "openai";
import type { Claim, CvBullet, Opportunity, Profile } from "@/lib/jev/types";

function pickBullets(profile: Profile, posting: Opportunity, n = 3): CvBullet[] {
  const hay = `${posting.title} ${posting.rawText}`.toLowerCase();
  const ranked = [...profile.bullets].sort((a, b) => {
    const score = (bullet: CvBullet) =>
      bullet.text
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 4 && hay.includes(w)).length;
    return score(b) - score(a);
  });
  return ranked.slice(0, n);
}

export function templateCoverLetter(
  profile: Profile,
  posting: Opportunity,
): { body: string; claims: Claim[] } {
  const bullets = pickBullets(profile, posting);
  const claims: Claim[] = bullets.map((b) => {
    const sentence = b.text.split(".")[0]?.trim() || b.text;
    return {
      claim: `${sentence}.`,
      cvBulletId: b.id,
      quote: b.text,
    };
  });

  const body = [
    `Hello ${posting.company} hiring team,`,
    "",
    `I'm applying for ${posting.title}. I am based in Melbourne and looking for work that matches these goals: ${profile.goals}`,
    "",
    ...claims.map((c, i) => `${i + 1}. ${c.claim}`),
    "",
    "Every claim above is tied to a CV evidence bullet. I would rather under-claim than invent production ownership.",
    "",
    "Kind regards",
  ].join("\n");

  return { body, claims };
}

function extractJson(text: string): { body: string; claims: Claim[] } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { body?: string; claims?: Claim[] };
    if (!parsed.body || !Array.isArray(parsed.claims)) return null;
    return {
      body: parsed.body,
      claims: parsed.claims.map((c) => ({
        claim: String(c.claim ?? ""),
        cvBulletId: String(c.cvBulletId ?? ""),
        quote: String(c.quote ?? ""),
      })),
    };
  } catch {
    return null;
  }
}

export async function draftCoverLetter(
  profile: Profile,
  posting: Opportunity,
): Promise<{ body: string; claims: Claim[]; source: "llm" | "template" }> {
  const fallback = templateCoverLetter(profile, posting);
  const apiKey = process.env.OPENAI_API_KEY?.trim() || process.env.NETLIFY_OPENAI_API_KEY?.trim();
  if (!apiKey) return { ...fallback, source: "template" };

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You draft conservative cover letters. Never invent production ownership, years, tools, or employers. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction:
              "Write a short cover letter. Every factual claim must include an exact quote copied from a CV bullet.",
            posting: {
              title: posting.title,
              company: posting.company,
              text: posting.rawText.slice(0, 6000),
            },
            goals: profile.goals,
            cv: profile.bullets,
            schema: {
              body: "string",
              claims: [{ claim: "string", cvBulletId: "string", quote: "exact substring of the bullet" }],
            },
          }),
        },
      ],
    });
    const text = completion.choices[0]?.message?.content ?? "";
    const parsed = extractJson(text);
    if (!parsed || parsed.claims.length === 0) return { ...fallback, source: "template" };
    return { ...parsed, source: "llm" };
  } catch {
    return { ...fallback, source: "template" };
  }
}
