# GainForest E2E

Authenticated E2E tests run through central sign-in on an HTTPS `*.gainforest.app` host so cookie and redirect behavior matches production.

The setup project uses disposable-email login and saves that account's browser state for the focused e2e specs. The optional handle/password sanity login only runs when `E2E_RUN_CONFIGURED_LOGIN_SANITY=1` is set. The authenticated specs are chained in Playwright project order: user onboarding/profile checks run on the personal disposable account, organization onboarding creates a CGS-backed organization with a separate disposable recovery email, and sites, observations, project creation, Cert creation, and audio run against that organization account. A second disposable account is created as a member for CGS permission checks. Teardown is mandatory: it destroys CGS service state when possible, deletes every run-owned CGS group and disposable user/member PDS account, verifies they are gone, and writes `reports/e2e/cleanup-smoke.json` plus credential metadata in `e2e/.auth/` for manual recovery if cleanup ever fails.

Local default:

```bash
cp e2e/.env.example e2e/.env
pnpm test:e2e
```

Defaults:

- URL: `https://local-e2e.gainforest.app`
- Auth: required via `NEXT_PUBLIC_AUTH_BASE_URL`
- PDS: `https://dev.certified.app`
- Disposable email provider: Mail.tm by default, so CGS recovery email can be set and later used for deletion
- Next.js port: `3201`
- Caddy route: `local-e2e.gainforest.app -> localhost:3201`

Useful overrides:

- `E2E_BASE_URL=https://preview.example.gainforest.app E2E_SKIP_WEB_SERVER=1 NEXT_PUBLIC_AUTH_BASE_URL=<auth-origin> pnpm test:e2e`
- `E2E_PORT=3202 pnpm test:e2e`
- `pnpm test:e2e:headed`

Videos, screenshots, traces, and the HTML report are written under `reports/e2e/`.
