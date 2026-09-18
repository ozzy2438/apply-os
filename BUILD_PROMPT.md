# Apply OS — Authoritative V1 Build Spec

> This file is the source of truth for Apply OS V1. Do not silently broaden scope (no LinkedIn scraping, ATS auto-submit, multi-tenant billing, or recruiter OAuth).

## Mission

Build a **personal career decision engine**. Ingest every job posting and recruiter message, score it against the user's goals and CV with typed, calibrated decisions from TypeSafe AI (Jev), land **3–5 high-fit opportunities** on a Melbourne morning desk, draft cover letters that are **guarded and citation-checked** before they can be marked ready, and track application status.

Traditional tools rank by keywords. Apply OS ranks by **judgment**: goal advancement, actual CV evidence, visa/location/compensation reality, and a confidence score on every decision.

Jev is not a chat model. It returns typed answers (choice, score, noul) with probability distributions. **Code owns control flow.** Jev never generates cover-letter prose.

## Stack

- Next.js App Router + TypeScript
- Netlify (`@netlify/plugin-nextjs`, `netlify.toml`)
- Drizzle ORM: SQLite locally (`.data/apply-os.db`); Postgres when `NETLIFY_DATABASE_URL` is set
- `@typesafe-ai/sdk` server-side only (`TypeSafeClient`, `choice`, `score`, `noul`)
- Cover-letter drafts: OpenAI-compatible client via Netlify AI Gateway / `OPENAI_API_KEY`; template fallback without keys
- Vitest for compose math, gates, citations, morning selection

## Demo mode

If `TYPESAFE_API_KEY` is missing, a typed mock client returns fixture-calibrated answers. The app must be fully usable locally with seed data and no cloud credentials.

## Profile

Single-user profile:

- CV as **evidence bullets** (`id`, `text`, optional `kind`: delivery | independent | experiment | backtest | learning)
- Career goals (free text + structured targets)
- Hard constraints: work rights, locations, remote/hybrid/onsite, compensation floor (AUD), seniority band
- Score **weights** (defaults below); changing weights must **not** re-call Jev

## Ingest

Paste posting text, paste a recruiter message, or optional URL fetch (best-effort extract). Classify source as `job_posting` | `recruiter_inbound`. Persist raw text. Then run **one batched** `systemOne` call.

## Decision engine

Questions and thresholds live in **one file**: `src/lib/jev/questions.ts`.

### Hard gates (Noul, fail-closed)

- Work-rights mismatch
- Location / remote impossibility
- Compensation clearly below floor
- Mandatory credential the CV does not have

A gate **fails** only when noul ≥ `0.80`. Uncertain gates (`0.20–0.80`) route to **review**, not auto-skip. noul < `0.20` is a pass.

### Composite scores (Score, levels 0–4, normalize `/4`)

| Dimension         | Default weight | Meaning                                      |
| ----------------- | -------------- | -------------------------------------------- |
| `goal_alignment`  | 0.30           | Role advances stated career goals            |
| `cv_evidence`     | 0.30           | CV can evidence the must-haves               |
| `seniority_fit`   | 0.15           | Level match vs stretch vs underlevel         |
| `domain_fit`      | 0.15           | Industry / problem-space fit                 |
| `comp_reality`    | 0.10           | Pay/band vs constraints                      |

`fit = weighted sum`. Recalculating rank never re-calls Jev.

### Action (Choice)

`apply_now` | `tailor_then_apply` | `skip` | `needs_review`

### Confidence routing

Using the action Choice's `confidence`:

- **High** (≥ 0.75) + `apply_now` / `tailor_then_apply` + no hard-gate fail → eligible for morning desk
- **Medium** → review queue
- **Low** (< 0.45) → do not auto-rank; show “insufficient evidence”

### Morning desk

Timezone: `Australia/Melbourne`. Among eligible items not applied/skipped/rejected, sort by `fit * action.confidence`, take **3–5**, persist a `briefing` for that Melbourne date.

## Cover letters

1. LLM (or template) emits claims as `{ claim, cv_bullet_id, quote }`.
2. Code string-matches `quote` to CV text (normalize whitespace/quotes). Missing quote → `fabricated`.
3. Surviving claims: one Jev Choice — `supports` | `contradicts` | `says_nothing`. Auto-accept at confidence ≥ 0.80; else human review.
4. Extra Noul guardrails: inflated tenure, fake production ownership, tools not in CV. Fail if noul ≥ 0.80.

**Ready to send** requires: zero `fabricated`/`contradicted`, no failed guardrail, and no unresolved low-confidence citation.

## Pipeline statuses

`inbox` → `review` → `ready` → `applied` → `interview` → `offer` | `rejected` | `skipped`

## App surfaces

| Route                 | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `/`                   | Morning desk                                         |
| `/inbox`              | All opportunities: fit, confidence, action, gates    |
| `/opportunities/[id]` | Score breakdown, drafts, citations, status           |
| `/pipeline`           | Kanban by status                                     |
| `/profile`            | CV bullets, goals, weights, constraints              |
| `/ingest`             | Paste posting or recruiter message                   |

Visual language: dense decision console (distribution bars, confidence). Not generic purple SaaS. Make explicit that this is not keyword search.

## Seed

8–10 realistic Australian Data Scientist / AI Engineer postings plus a sample Melbourne profile (synthetic CV; not a private résumé). Mix high-fit, stretch, and should-skip.

## Out of scope

LinkedIn/Gmail scraping, ATS auto-submit, multi-user SaaS, billing, recruiter OAuth, chat UIs that treat Jev as a text generator.

## Quality bar

- `npm run lint`, `npm test`, `npm run build` pass
- Demo mode works with no API keys
- TypeSafe credentials stay server-side
- `.env.example` documents `TYPESAFE_API_KEY`, optional `OPENAI_API_KEY` / Netlify AI Gateway, `NETLIFY_DATABASE_URL`
- `.gitignore` includes `.netlify` and `.data`
