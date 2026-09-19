# Apply OS security review notes

## Credentials and provider keys

- `TYPESAFE_API_KEY`, `OPENAI_API_KEY`, `NETLIFY_DATABASE_URL`, and any Playwright/browser secrets are **server-only**.
- Never prefix them with `NEXT_PUBLIC_`.
- Never put keys in URLs, client bundles, audit payloads shown in the UI, or cover-letter drafts.
- Demo mode is the default when TypeSafe is unset. The mock client is deterministic and local.

## User data

- Profile, CV evidence, job raw text, letters, and notes live in SQLite or Netlify Postgres.
- Raw source text is stored separately from normalized fields so a bad extract can be replayed without trusting the model.
- Logs and audits store hashes and structured summaries, not passwords, cookies, or payment data.
- Do not paste untrusted page HTML into Jev. Observations are an allow-listed accessibility snapshot.

## Browser sessions

- Real Playwright runs only when `APPLY_OS_BROWSER_ASSIST=true` **and** the app is not in demo mode.
- Sessions are user-authorized, purpose-scoped (`URL_IMPORT`, `READ_ONLY_DISCOVERY`, …), and capped.
- Login stays user-controlled. Apply OS does not store plaintext passwords or fill password fields.
- Hidden, disabled, off-screen, payment, and security-code controls are stripped from the action space.
- CAPTCHA, anti-bot walls, and login walls **stop** the worker. No evasion.

## Files

- CV / supporting files are user-selected. Metadata (name, evidence id, selected flag) is stored; bytes would go in access-controlled storage if uploaded later.
- Upload and attach are **IRREVERSIBLE**. They require a just-in-time approval token. Demo mode never uploads.

## Approvals and audit

- `READY` requires citation/claim policy pass.
- `APPLIED` / submit / send-message / accept-terms require an `approval_events` row of the matching kind.
- Browser execute checks `observationVersion` before acting.
- Decision timeline is reconstructible from `decision_audits` without asking a model to invent a story.

## Threat notes

| Risk | Mitigation |
| --- | --- |
| Prompt injection from a job page | Page HTML is not an instruction. Action space is code-built. |
| Model emits `document.querySelector` / Playwright | Executor accepts only indexed actions from the current observation. |
| Stale click after a re-render | Version mismatch → discard and re-observe. |
| Auto-submit | IRREVERSIBLE policy + missing approval token → block. |
| Secret leakage in audits | Redact URLs with credentials; never log cookies or Authorization headers. |
