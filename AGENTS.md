# AGENTS.md — read this first (humans and AI agents)

NuraWell is built as **pluggable modules** (like WordPress plugins) so any product can take any module, and any
module built elsewhere can be contributed back. Full plan: `docs/architecture/MODULE_CATALOG.he.md`.

## Start here
1. `modules/INDEX.md` — every module, version, distribution tier, docs (generated).
2. `llms.txt` (root) and `<module>/llms.txt` — short agent quickstarts: API, install, what must NOT change.
3. `modules/module.schema.json` — the `module.json` contract.

## Commands (Node built-ins only, no deps)
| | |
|---|---|
| `node scripts/modules/list.mjs` | modules in dependency order |
| `node scripts/modules/check.mjs` | validate every module.json, docs, deps, coupling rules |
| `node scripts/modules/index.mjs` | regenerate `modules/INDEX.md` + `llms.txt` (`--check` in CI) |
| `node scripts/modules/install.mjs <id> --target <repo> [--dry-run]` | copy a module + its deps + owned migrations into another repo |
| `node scripts/modules/pack.mjs <id>` | versioned tarball for a GitHub Release (free cross-repo sharing) |
| `node scripts/modules/verify.mjs` | adoption check (CI): check + fresh index + module tests |

## Non-negotiable rules
- **Security → privacy → features.** Security/privacy modules are `toggleable: false` (always on).
- **Fail closed.** Missing config, unknown state, errors → deny / 404, never open.
- **No secrets anywhere** in code, module.json or docs. `env` lists NAMES only. Never read `/workspace/consent-legal/secrets`.
- **Shareable/sellable modules**: no imports from `apps/*`, no `process.env`; config and keys are injected.
- **Frozen behavior**: the enc:v2 wire format and AAD strings; Almog's prompts/outputs (golden tests); the accessibility
  widget's behavior. Behavior-preserving refactors only, proven by tests.
- **Never delete user data** when disabling/uninstalling a module; archive and ask the owner.
- Only non-identifying data goes to AI providers. Design: no #fff backgrounds, no yellow→green gradient, RTL, mobile-first.

## Adding or contributing a module
Create `packages/@platform/<name>/` with `module.json`, `package.json` (same name/version), `README.he.md`,
`CHANGELOG.md` (an entry for the version), `llms.txt`, `src/`, tests. Bump semver (breaking = major), tag
`mod/<id>@x.y.z`, run `node scripts/modules/index.mjs` and `verify.mjs`. A module from another repo comes back as a PR
that passes `verify.mjs` plus a security review.

## Module-first (all products)
- Every new feature, in any product, starts as a module: `npx @platform/modules new <id> --tier internal|shareable|sellable [--category feature|ui|ops|platform|security|privacy]`
  (same as `node scripts/modules/new.mjs`). It creates module.json, README.he.md, llms.txt, CHANGELOG, config.schema.json (secure defaults), migrations/, conformance test stubs, and regenerates the index.
- App shells (`apps/*`) only compose modules. CI runs `node scripts/modules/boundaries.mjs`: new files under `apps/*` fail unless they are thin routing/layout glue (page/layout/route/... ≤ 80 lines), tests, config or assets.
- `modules/legacy-app-files.txt` lists existing NuraWell feature files "to be modularized". It may only shrink; never add to it.
