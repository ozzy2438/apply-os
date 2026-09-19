# Resume assembly prompt

Use the exact runtime instructions exported by `src/writer.ts` as the source of truth; this file describes the contract, not an alternative prompt to concatenate.

Input: a server-generated ResumePlan and only its permitted approved claim cards, plus the actual job requirements. Output: `schemas/resume-draft.schema.json`.

Choose and order IDs. Do not output new prose or rewrite source metadata. Prefer the strongest supported job-relevant evidence without losing constraints or repeating the same fact. Respect the supplied entry/bullet/summary/skill budgets. Do not pad a short evidence base with invention. Every ID must occur in the supplied plan.

If a better phrase is needed, use the separate rewrite-proposal workflow; do not smuggle prose through an ID or field. Structured output validates shape, not truth. Final factual support and Ready status are not this model's decisions.
