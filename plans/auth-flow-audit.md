# NuraWell — Authentication & Authorization Flow Audit

_Scope: Supabase Auth (JWT) + SSR cookies, middleware route protection, the
public⇄Ops subdomain bridge, API route guards, and service-role usage._

Status legend: ✅ verified safe · ⚠️ needs attention · ❌ gap · 🔬 requires live testing

---

## 1. Session & cookie handling

| Check | Finding | Status |
|-------|---------|--------|
| Auth cookies set via `@supabase/ssr` (`createServerClient`) | All cookie writes go through `mergeAuthCookieOptions` (`lib/supabase/cookie-options.ts`) | ✅ |
| HttpOnly / Secure / SameSite | Inherited from Supabase SSR defaults; `mergeAuthCookieOptions` only augments domain/path | ⚠️ Confirm `Secure` + `SameSite=Lax` are present in the emitted `Set-Cookie` in production |
| Cookie `domain` scope | `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` normalized with a leading `.` for subdomain sharing (app ⇄ ops) | ⚠️ Must NOT be set to a shared apex like `.vercel.app`; only `.nurawell.ai` |
| Session read in middleware uses `supabase.auth.getUser()` (not `getSession()`) | `getUser()` revalidates the JWT against Supabase — not just trusting the cookie | ✅ Good practice |

**Action:** add a runtime assertion (or startup log) that warns if
`NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` resolves to a known shared suffix
(`vercel.app`, `netlify.app`, `pages.dev`).

---

## 2. Middleware route protection (`apps/web/middleware.ts`)

| Check | Finding | Status |
|-------|---------|--------|
| Unauthed access to protected routes | `if (!user && !isPublicRoute)` → redirect to `/login?redirect=<path>` | ✅ |
| `PUBLIC_ROUTES` allowlist | Explicit list; everything else requires a session | ✅ |
| Email-verification gate | Unverified users forced to `/register/check-email` except `EMAIL_VERIFY_EXEMPT` | ✅ |
| Ops host gate | Ops subdomain only serves `/ops/*`; non-panel paths redirect to `/` | ✅ |
| Direct `/ops` access from public domain | Treated as nonexistent → redirect to app home | ✅ |
| Ops admin check | Reads `profiles.role === 'admin'` server-side before serving panel | ✅ Defense-in-depth (also enforced in `ensureOpsAdminServer`) |
| `last_active_at` best-effort update | Uses `.then(ok, err)` so a DB failure can't block navigation | ✅ |
| Matcher coverage | Excludes static assets only; all pages + `/api` pass through | ✅ |

**Note:** middleware authorization is a *first* gate. Page-level
(`ensureOpsAdminServer`) and API-level (`requireApiAdmin`) checks are the
authoritative ones — middleware must never be the sole guard.

---

## 3. Open-redirect surface

| Vector | Mitigation | Status |
|--------|-----------|--------|
| `/login?redirect=<url>` | Only redirects to Ops bridge when `isOpsLoginRedirectUrl(rawRedirect)` matches the configured Ops origin; otherwise app home | ✅ but 🔬 fuzz `isOpsLoginRedirectUrl` |
| `/auth/callback?next=//evil.com` | `next` should be validated as a relative path or same-origin | ⚠️ Verify `auth/callback` rejects protocol-relative (`//host`) and absolute external URLs |
| Ops bridge (`/auth/bridge-to-ops`, `/auth/ops-ingest`) | `next` carried through bridge — must be re-validated against Ops origin on ingest | 🔬 Test bridge `next` tampering |
| Registration redirect param | Same rules as `/login` | 🔬 Test |

**Action:** centralize redirect validation in one helper
(`isSafeInternalRedirect(url)`) used by `/login`, `/auth/callback`, and the Ops
bridge. Reject: absolute URLs to non-allowlisted origins, protocol-relative
(`//`), `data:`/`javascript:` schemes, and back-slash tricks (`/\evil.com`).

---

## 4. API route authorization (`lib/api/route-guards.ts`)

| Guard | Behavior | Status |
|-------|----------|--------|
| `requireApiSession` | Accepts SSR cookie OR `Authorization: Bearer`; 401 if no valid user | ✅ |
| `requireApiAdmin` | Builds on session, then checks `profiles.role === 'admin'`; 403 otherwise | ✅ |
| `requireOpsApiAdmin` | Ops-specific guard (host + admin) | ✅ (see `route-guards`/ops) |
| Bearer path | Uses anon key + per-request `Authorization` header → RLS still applies | ✅ Token is validated by `getUser()` |

**Action / 🔬:** enumerate every handler under `app/api/v1/admin/*` and confirm
each calls `requireApiAdmin`/`requireOpsApiAdmin` **before** any DB access. The
`(admin as any).from(...)` service-role calls bypass RLS, so the guard must run
first. (Tracked as part of the IDOR test matrix below.)

---

## 5. Service-role key usage

| Check | Finding | Status |
|-------|---------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` server-only | Used in `lib/supabase/admin.ts` / `service-admin-client.ts`; never imported into client components | ✅ Verify no `NEXT_PUBLIC_` prefix |
| Service-role calls bypass RLS | Every `admin`-client call must be preceded by an explicit authz check | ⚠️ Enforced ad-hoc per route — see §4 action |
| Startup validation | `assertSupabaseBackendSecretKey` should fail fast on missing/short keys | 🔬 Confirm it runs before first admin call |

---

## 6. Penetration test matrix (run against staging — see `supabase/tests/rls-pentest.sql` for DB-layer)

- [ ] **Open redirect:** `/login?redirect=https://evil.com`, `…?redirect=//evil.com`, `…?redirect=/\evil.com`
- [ ] **Open redirect:** `/auth/callback?code=x&next=//evil.com`
- [ ] **IDOR:** `GET /api/v1/progress` then tamper user context / `userId`
- [ ] **IDOR:** journey-progress / profile / notification update for another user's id
- [ ] **Privilege escalation:** call `/api/v1/admin/*` with a regular-user session (expect 403)
- [ ] **Privilege escalation:** self role-update via API and via direct PostgREST (covered by `rls-pentest.sql` Test 2)
- [ ] **Bridge tampering:** manipulate `next` through `/auth/bridge-to-ops` → `/auth/ops-ingest`
- [ ] **Cookie scope:** confirm auth cookie `Domain` is `.nurawell.ai`, not a shared suffix

---

## 7. Summary of recommended code changes

1. Add `isSafeInternalRedirect()` and route all `redirect`/`next` params through it. _(highest value)_
2. Add startup guard that rejects shared cookie-domain suffixes.
3. Add a lightweight test asserting every `app/api/v1/admin/*` route module imports a `requireApiAdmin`/`requireOpsApiAdmin` guard.
4. Continue migrating `(admin as any)` calls to typed clients so the "guard-before-query" invariant is easier to audit (tracked tech-debt — see security-audit-plan.md §A).
