# Apply OS

**Personal career decision engine powered by TypeSafe AI (Jev).**

Apply OS ingests every job posting and recruiter message you receive, scores each one against your goals and CV with typed, calibrated decisions from Jev, and lands 3–5 real high-fit opportunities on your desk every morning. Cover letters are drafted, guarded, and citation-checked before you send them. Application status is tracked automatically.

## Why Apply OS

Traditional job search tools rank by keywords, filters, and unreadable relevance scores. Apply OS ranks by **judgment**: how much a specific posting advances *your* stated career goals, matches *your* actual CV, and fits *your* visa, location, and compensation reality — with a confidence score attached to every decision.

Jev is not a chat model. It returns typed answers (yes/no, choice, score) with probability distributions your code can branch on. That is the exact primitive a rigorous personal application pipeline needs.

## Spec

The agency-ready specification is [`BUILD_PROMPT.md`](./BUILD_PROMPT.md). V1 is implemented in this repository.

## Quick start

```bash
npm install
cp .env.example .env.local   # optional; demo mode works without keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Seed data loads on first boot (synthetic Melbourne profile + mixed-fit AU postings).

```bash
npm test
npm run lint
npm run build
```

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | No | Live Jev evaluations. **Without it, demo mode** uses a typed mock client. |
| `OPENAI_API_KEY` | No | Cover-letter drafts via OpenAI / Netlify AI Gateway. Template fallback otherwise. |
| `OPENAI_BASE_URL` | No | Override API base (Netlify AI Gateway). |
| `NETLIFY_DATABASE_URL` | No | Postgres. Local default is SQLite at `.data/apply-os.db`. |
| `APPLY_OS_BROWSER_ASSIST` | No | Enable real Playwright. Demo mode still never opens a browser. |

TypeSafe credentials are used **server-side only**.

## How judgment works

1. One batched Jev `systemOne` call per opportunity (gates, scores, recommended action).
2. Code composes a weighted **fit** score. Changing weights never re-calls Jev.
3. Confidence routes: auto desk / review / insufficient evidence.
4. Cover-letter claims are string-matched to CV quotes, then Jev-checked (`supports` / `contradicts` / `says_nothing`). Fabricated or contradicted claims block **Ready**.

See [`src/lib/jev/questions.ts`](./src/lib/jev/questions.ts) for every question and threshold.

## App surfaces

| Route | What you see |
| --- | --- |
| `/` | Morning desk (3–5 roles, `Australia/Melbourne`) |
| `/inbox` | Every ingested opportunity |
| `/opportunities/[id]` | Score breakdown, letter, citations, status |
| `/pipeline` | Kanban |
| `/profile` | CV evidence, goals, constraints, weights, rules |
| `/ingest` | Paste a posting, URL, or recruiter note |
| `/discover` | Job Discovery Assistant (read-only, simulated in demo) |
| `/evidence` | Verified evidence library |
| `/audit` | Decision / approval timeline |

Architecture: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). Security notes: [`docs/SECURITY.md`](./docs/SECURITY.md). Setup: [`docs/SETUP.md`](./docs/SETUP.md).

## Deploy (Netlify)

This project is configured for Netlify (`netlify.toml`, `@netlify/plugin-nextjs`). Set the env vars above in the Netlify UI. For production persistence, provision Netlify Database and set `NETLIFY_DATABASE_URL`.

## Docs

- [TypeSafe introduction](https://docs.typesafe.ai/introduction)
- [Composite scoring](https://docs.typesafe.ai/patterns/composite-scoring.md)
- [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript.md)
- [Confidence](https://docs.typesafe.ai/confidence.md)
- [Citation check cookbook](https://docs.typesafe.ai/cookbooks/citation_check.md)

## Status

V1 implemented. Demo mode is first-class.
