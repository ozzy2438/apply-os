# Local setup

```bash
npm install
cp .env.example .env.local   # optional
npm run typesafe:login       # TypeSafe must accept the key before it is saved
npm run dev
```

Open http://localhost:3000. Seed data loads on first boot.

```bash
npm test
npm run lint
npm run build
```

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | unset = demo | Live Jev |
| `OPENAI_API_KEY` | unset = templates | Cover letters / drafts |
| `OPENAI_BASE_URL` | provider default | Netlify AI Gateway |
| `NETLIFY_DATABASE_URL` | SQLite `.data/apply-os.db` | Postgres |
| `APPLY_OS_BROWSER_ASSIST` | `false` | Enable real Playwright URL import / discovery |
| `APPLY_OS_POLICY_VERSION` | `v2.0.0` | Override stored policy id (tests) |

## Browser assist

Leave the flag off unless you intend to drive a real browser.

```bash
# only if APPLY_OS_BROWSER_ASSIST=true and not in demo mode
npx playwright install chromium
```

Demo mode **never** opens a real browser. Job Discovery Assistant still works against a simulated board.

## Queue

Work items persist in `work_queue`. Server actions process them in-process. No Redis required for V1/V2 local or Netlify.

## Schema

Fresh databases run `src/lib/db/ddl.ts` plus `src/lib/db/migrate.ts`. Existing V1 databases gain additive columns/tables on boot.
