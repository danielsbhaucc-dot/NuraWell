# Platform module library

One library, consumed by every product (NuraWell, the parent site / platform-core, new products).

## Where it lives
- `packages/@platform/<name>/` in the NuraWell repo (private, free). Each package = `package.json` (version) + `module.json` (schema: `modules/module.schema.json`) + `src/index.ts` (the only public API) + `README.he.md` + `llms.txt` + tests + `migrations/` + security conformance.
- fx-* visual modules (particle words, torch reveal, horizontal reel, encryption demo, a11y switch, chat demo, Finder console) live in the **platform-core** repo under the same `module.json` schema (`tier`, `repo`, both docs). They are listed in CATALOG.md with `repo: platform-core`.

## Versioning (free, no registry)
- semver in each `package.json` + git tag `@platform/<name>@<version>` on the repo that owns it.
- Same repo: workspace dependency `"@platform/<name>": "workspace:*"`.
- Other repo: `pnpm add "github:danielsbhaucc-dot/NuraWell#@platform/<name>@<version>&path:/packages/@platform/<name>"` (or `git subtree`/sparse checkout of the tag). Private GitHub access via the consuming repo's deploy key.

## Pulling modules into a product (3 commands)
1. `node packages/@platform/modules/bin/platform-modules.mjs new <product>` – product.json + console registration.
2. `node packages/@platform/modules/bin/platform-modules.mjs install <module...>` – installs packages + migrations + env checks. Target (not built yet): driven by product.json, also wiring routes, crons, menus and hooks, fail-closed.
3. Enable/disable per product in the console (existing IAM gating + fresh device approval).

## Status
Design document. Implemented today: packages, module.json schema, versions, `new`/`install`/`check`/`pack`/`verify`, IAM gating. Not yet: product.json installer wiring, hook registry, token-only UI conformance, embed keys/metering/signing, pivot e2e.

## Design / theming
- All UI reads CSS variables from one tokens file (`@platform/ui` tokens). No hex colors or font names in module code (conformance check).
- Markup overrides via named `slots` in module.json.
- Restyle in one step: override the variables in the product's tokens file.

## Selling a module (e.g. a11y)
One-line embed (`<script src=".../a11y.js" data-key="pk_...">` or npm), per-customer key + allowed-origins list, customer theming via the same tokens, usage metering, tenant isolation, no NuraWell data or secrets in the bundle, signed release + SBOM per version. Declared in `module.json` `embed`.
