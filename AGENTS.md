
## Convention (enforced by `node scripts/modules/convention.mjs` in CI)
- Layout: `packages/@platform/<id>/{package.json, module.json, src/index.ts, README.he.md, llms.txt, CHANGELOG.md, tests, migrations/, tokens.json (UI modules)}`.
- `module.json` id = folder name, package = package.json name, version = package.json version, CHANGELOG has that version.
- One central catalog: `packages/@platform/CATALOG.md`. No duplicate ids; before adding a module, check the catalog for overlap.
- Small focused PRs; semver + tag `@platform/<id>@<version>`.

## Flexibility (3 levels, for every UI/sellable module)
1. Presets: `preset: "<name>"` picks built-in themes/positions/feature sets.
2. Config: one typed, validated object: `tokens` (colors, fonts, radius, size, position), `i18n`, `features`, `parts` (CSS parts/slots), `on` (event hooks). Invalid or unsafe configs are rejected (contrast below WCAG AA, removing keyboard access, disabling security).
3. Customer variant: a separate overlay package (`@variants/<customer>-<id>`) that depends on the core by version and only supplies preset/config/slot overrides. Never fork the core; core updates flow by bumping the version.
