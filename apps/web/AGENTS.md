<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Design rules (mandatory, all agents and contributors)
- Read `apps/web/DESIGN_SYSTEM.md` before any UI work. The existing landing page and product screens are canonical. Match them, and don't redesign them.
- Never use white (`#fff`, `white`, `bg-white`, `rgb(255,255,255)`) or raw hex in feature code. Use the tokens and the `@/components/ui` primitives.
- `npm run lint:design` must pass, and it is part of `npm run test` and CI.
- Every UI PR fills in the Design parity review in the PR template and attaches side-by-side screenshots next to the landing page and the closest existing screen.
- A bold new visual idea is a sketch for approval, not code.
