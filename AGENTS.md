# Agents guide (modules)
- Module manifests: `modules/<id>/module.json` (app areas) and `packages/@platform/<name>/module.json` (library). Read the module's `llms.txt` first.
- Import another module only through its public API (`module.json` `api`, or the package `src/index.ts`). CI: `node scripts/modules/imports.mjs` (baseline may only shrink).
- Add/enable a module: see `packages/@platform/LIBRARY.md` (3 commands). Never hardcode colors/fonts; use token CSS variables. Restyle = edit the tokens file.
- Never put real owner names in code; never print secrets.
