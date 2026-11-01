# @core/security-privacy — kit (v1.0.0, distribution: sellable)
Same security level in every product, built once. Backend only (no UI → no theme tokens).

## Install (one step)
1. `node scripts/core-sync.mjs <platform-core sha> security-privacy` → `packages/@core/security-privacy`, add it to workspaces/`transpilePackages`.
2. Config/env block (server only): optional `KIT_CENTRAL_REPORTING=on` + `CENTRAL_PRODUCT_ID`, `CENTRAL_SUPABASE_URL`, `CENTRAL_SUPABASE_SECRET_KEY`, `CENTRAL_METRICS_FEED_SECRET` (central adapter, OFF by default); optional `UPSTASH_REDIS_REST_URL/TOKEN` (distributed rate limit).
3. Init once: `await initSecurityPrivacy({ productId, licenseActive? })`.

## Parts
| import | gives |
|---|---|
| `@core/security-privacy/headers` | `securityHeaders({ overrides })`, `toNextHeaders()` |
| `@core/security-privacy/rate-limit` | `fixedWindowUpstash`, `fixedWindowMemory`, `rateLimitResponse`, token-bucket `rateLimiter` |
| `@core/security-privacy/authz` | default-deny server authz (grants, expiry, anti-escalation) |
| `@core/security-privacy/crypto` | enc:v2 field envelope (AES-256-GCM, per-user DEK wrapped by KEK, AAD `<productId>:field:t:c:row`), blind index — byte-compatible with NuraWell production data |
| `@core/security-privacy/feed` | optional central adapter: `sendSecurityEvent`, `sendSecurityStatus`, `signUsage` |

## Contract
Central adapter: see `packages/product-connector/README.md` (signed, ±5 min, nonce, aggregates only; status may carry `kits: { name: semver }`).
Licensing: sellable copies are gated by `@core/licensing` (signed status, blocklist, hidden mark); security parts fail safe.

## Test
`pnpm test` → `tests/shared-backend.test.ts`. In a product: `node scripts/core-sync.mjs --check` (no local edits).
