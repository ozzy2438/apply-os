# Apply OS architecture (V1 + discovery layer)

Apply OS remains a **career decision engine**, not a chatbot and not an auto-apply bot.

> Helps a user decide which jobs deserve time, produces evidence-grounded drafts, and tracks the search — without submitting applications.

V1 (morning desk, inbox, citation-gated letters, pipeline) is preserved. This document describes the layer added on top.

## Four layers

| Layer | Owns | Must not |
| --- | --- | --- |
| **1. Deterministic policy & data** | Hard filters, score composition, status transitions, risk, approvals, persistence | Call a model to decide “is this allowed?” |
| **2. Jev structured decisions** | Typed scores, choices, noul flags inside a code-supplied rubric | Write prose, invent JS/selectors/Playwright, chat |
| **3. Generative writing** | Cover letters, recruiter drafts, summaries, extraction drafts | Invent facts, send messages, submit forms |
| **4. Browser observation & execution** | Visible a11y elements, bounded action space, postconditions | Hidden DOM, model-generated selectors, irreversible acts without a token |

Control flow:

1. Code decides what is technically possible and allowed.
2. Jev picks among those choices.
3. A generative model writes text only when text is required.
4. The user approves consequential actions.

```
Job source → ingest/extract → canonical JobPosting (Zod)
  → hard-filter engine → (optional) Jev semantic scoring
  → policy engine → Daily Desk / Inbox / Review
  → cover-letter generation → claim verification
  → user-approved application *preparation* (never silent submit)
```

## Providers

`DecisionProvider` and `GenerationProvider` are the only model seams.

- **Decision:** live Jev (`TYPESAFE_API_KEY`) or typed demo mock.
- **Generation:** OpenAI / Netlify AI Gateway or template/demo fallback.

Keys stay server-side. The client never sees provider secrets or browser-session material.

## Browser assistance (phased)

Feature flag: `APPLY_OS_BROWSER_ASSIST=true`. Easy to leave off.

| Phase | Allowed | Forbidden |
| --- | --- | --- |
| 1 URL import | Open the supplied URL, extract visible text, hash snapshot | Navigate away without permission |
| 2 Read-only discovery | Inspect visible cards, open detail, scroll, paginate if permitted, import to Inbox | Apply, message, upload, CAPTCHA, login bypass |
| 3 Low-risk assist | Save/bookmark locally, open detail, copy approved letter | External side effects without opt-in |
| 4 Form assist | Map fields, draft prefills, review screen | Submit without just-in-time approval |

Demo mode **never** launches a real browser. It uses simulated observations so the UI is fully usable.

Every browser decision is bound to an `observationVersion`. Stale decisions are discarded. Every executed action has a postcondition. Risk:

- NONE / LOW — session permission is enough
- MEDIUM — session opt-in + visible log
- HIGH — per-step approval
- IRREVERSIBLE — just-in-time confirmation; never auto

Jev chooses an operation and a **code-indexed** target. It does not emit text to type or CSS selectors. Typed text comes from templates, saved queries, or a constrained generative draft the user can see.

## Persistence

Local SQLite (`.data/apply-os.db`); Postgres when `NETLIFY_DATABASE_URL` is set. Additive tables (evidence, audits, browser session, approvals, work queue, notes) sit beside V1 tables. Canonical job JSON is stored next to the raw source text.

Background work uses a durable `work_queue` table (Netlify-friendly). Redis/BullMQ is not required.

## Desk ranking (policy versioned)

Eligible items (no hard block, high enough confidence, not closed) are ranked:

```
deskScore =
  0.35 * finalFitScore +
  0.20 * recencyScore +
  0.15 * evidenceReadinessScore +
  0.15 * strategicValueScore +
  0.10 * preferenceScore +
  0.05 * diversityScore
```

Take 3–5. Weights live in `src/lib/policy/version.ts`. Changing weights never re-calls Jev.

## Policy version

`POLICY_VERSION` (`v2.0.0`) is stored on every `JobEvaluation` and `DecisionAudit`. Fit score and confidence are never treated as the same number: high fit + low confidence → `REVIEW_REQUIRED`.
