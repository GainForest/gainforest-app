# Bumicerts E2E

Authenticated E2E tests run through central sign-in on an HTTPS `*.gainforest.app` host so cookie and redirect behavior matches production.

The setup project first smoke-tests the configured handle/password account, then creates a fresh disposable email account and saves that disposable account's browser state for the real checklist test. Teardown deletes the run-owned disposable account automatically.

Local default:

```bash
cp e2e/.env.example e2e/.env
# Fill E2E_TEST_HANDLE and E2E_TEST_PASSWORD in e2e/.env
pnpm test:e2e
```

Defaults:

- URL: `https://local-e2e.gainforest.app`
- Next.js port: `3201`
- Caddy route: `local-e2e.gainforest.app -> localhost:3201`

Useful overrides:

- `E2E_BASE_URL=https://preview.example.gainforest.app E2E_SKIP_WEB_SERVER=1 pnpm test:e2e`
- `E2E_PORT=3202 pnpm test:e2e`
- `pnpm test:e2e:headed`

Videos, screenshots, traces, and the HTML report are written under `reports/e2e/`.
