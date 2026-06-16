# GainForest E2E

Authenticated E2E tests run through central sign-in on an HTTPS `*.gainforest.app` host so cookie and redirect behavior matches production.

The setup project creates a fresh disposable email account and saves that disposable account's browser state for the focused e2e specs. The authenticated specs are chained in Playwright project order so account setup, profile edits, sites, observations, project creation, bumicert creation, audio, and settings checks run as separate files while sharing the disposable account. Teardown deletes the run-owned disposable account automatically.

Local default:

```bash
cp e2e/.env.example e2e/.env
pnpm test:e2e
```

Defaults:

- URL: `https://local-e2e.gainforest.app`
- Auth: `https://dev.auth.gainforest.app`
- Next.js port: `3201`
- Caddy route: `local-e2e.gainforest.app -> localhost:3201`

Useful overrides:

- `E2E_BASE_URL=https://preview.example.gainforest.app E2E_SKIP_WEB_SERVER=1 pnpm test:e2e`
- `E2E_PORT=3202 pnpm test:e2e`
- `pnpm test:e2e:headed`

Videos, screenshots, traces, and the HTML report are written under `reports/e2e/`.
