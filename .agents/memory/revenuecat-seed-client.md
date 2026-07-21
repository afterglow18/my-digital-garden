---
name: RevenueCat seed client
description: How to create the RC management API client in scripts/ and what API keys are set.
---

## Client pattern (scripts/src/revenueCatClient.ts)

`getUncachableRevenueCatClient()` wraps `@replit/revenuecat-sdk/client`'s `createClient` with a custom `fetch` that routes all requests through `@replit/connectors-sdk`'s `ReplitConnectors.proxy("revenuecat", ...)`. OAuth tokens are injected automatically by the proxy.

**Critical:** `createClient` baseUrl must be `https://api.revenuecat.com/v2` (not just `https://api.revenuecat.com`). The SDK appends paths like `/projects` (no v2 prefix), so the base must include `/v2`.

**Why:** Without `/v2` in baseUrl, the SDK builds URLs like `https://api.revenuecat.com/projects` → proxy sends `/projects` → RevenueCat returns 404 code 7117 "Page not found."

## RC project created

- Project name: "My Digital Garden"
- Entitlement: `premium`
- Product identifier: `premium_monthly`  ($9.99/month)
- Offering: `default` (set as current)
- Package: `$rc_monthly`

## Env vars set

- `VITE_REVENUECAT_TEST_KEY` — RevenueCat test store public key (starts with `test_`)
- `VITE_REVENUECAT_IOS_KEY` — RevenueCat iOS App Store public key (starts with `appl_`)

Both set as shared env vars (not secrets) — VITE_ prefixed keys are embedded in the Vite bundle and are public identifiers.

## How to apply

- These keys are already read in `src/lib/revenuecat.tsx` via `import.meta.env.VITE_REVENUECAT_*`
- For Codemagic builds: remove `VITE_API_BASE_URL` from the build env group; add `VITE_REVENUECAT_IOS_KEY`
- Run `npx cap sync` after `pnpm install` in Codemagic to register `@capacitor/share` and `@capacitor/filesystem` plugins
