# NuraWell Design System · מערכת העיצוב

> **הכלל:** כל רכיב חדש נראה כאילו עוצב יחד עם דף הנחיתה והמסכים הקיימים. שוויון לדף הנחיתה הוא המינימום. **אין לבן.**
> **Rule:** every new component must look designed together with the landing page and existing product screens. Parity with the landing page is the minimum, not the goal. **No white.**

## 1. Canonical references (do not redesign)
These screens ARE the style. New work copies them, it does not reinvent them:
- Landing page (`app/landing-v2`): deep forest hero, glass cards, emerald→teal glow.
- Your Plan habit cards (`components/plans/PlanHabitCard.tsx`, `AlmogPlanSections.tsx`): glass card, 24px radius, 4px accent top bar, soft forest shadow.
- Almog next-step card (`components/journey/JourneyNextStepCard.tsx`): gradient CTA, Almog chip header.
- Cookie notice dark-forest theme (`components/legal/cookies`).

## 2. Tokens (`app/globals.css` `@theme`) — the ONLY place colors live
| Purpose | Token (Tailwind) |
|---|---|
| App canvas | `bg-canvas` |
| Card material | `bg-surface/85 backdrop-blur-md` |
| Raised sheet / popover | `bg-surface-elevated` |
| Wells, inputs, tiles inside a card | `bg-surface-sunken` |
| 1px borders | `ring-hairline` / `border-hairline` |
| Dark signature (hero bands, admin chrome, auth) | `forest-950 … forest-600` |
| Text | `text-ink`, `text-ink-soft`, `text-ink-faint` (AA on surface) |
| Text on dark / on brand buttons | `text-on-dark`, `text-on-dark-soft` (pearl, never `#fff`) |
| Glow accents | `glow`, `glow-teal`, `primary-*`, `secondary-*` |
| Shadows | `shadow-float`, `shadow-lift`, `shadow-btn` |
| Motion easing | `ease-(--ease-spring)` |

Banned: `#fff`, `#ffffff`, `white`, `bg-white`, `rgb(255,255,255)`, `*-white` utilities, yellow→green gradients, flat cream or mint fills, raw hex outside `globals.css`.

## 3. Primitives (`components/ui`, import from `@/components/ui`)
- `Button` — `primary` (emerald→teal gradient CTA), `secondary` (glass), `soft` (tinted in-card pill), `ghost`, `danger`, `dark` (forest, for admin/auth). Sizes `sm | md | lg`, `loading`.
- `Surface` / `Card` — tones `glass | elevated | sunken | dark`, `accent` adds the signature top bar. `CardTitle`.
- `Input` — sunken well with an emerald focus halo.
- `Sheet` / `Dialog` — native `<dialog>` (no alert/confirm/prompt), elevated glass, forest scrim.
- `Banner` (`info | success | warn | danger`), `Badge` (`brand | soft | warm | dark`), `ListRow` (admin tables/lists).
- `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton`, `PageSkeleton`.

Feature code must not hand-style `<button>`; use `Button`. A missing variant goes into `components/ui` first, then gets used.

## 4. Signature patterns
1. **Layered glass:** translucent surface + `backdrop-blur` over the sage canvas or a forest band, a hairline ring, and a soft forest-tinted shadow. Never an opaque light box.
2. **Accent bar:** a 4px emerald→teal top bar marks the primary card of a section.
3. **Forest depth:** important moments (auth, admin chrome, hero, CTA) sit on deep forest with pearl text and an emerald glow.
4. **Typography:** Rubik display (800–900) for titles, Heebo body; 17px card titles, 13px body in cards, 11px kickers in bold color.
5. **Radius scale:** 24px cards, 16px buttons and inputs, 12px tiles, full for chips.
6. **Motion:** 200–400ms with spring easing and `active:scale-[0.98]`. Always add `motion-reduce:` fallbacks.
7. **RTL-native:** logical props (`ps-`, `me-`, `start`), arrows point left for "forward", `dir="rtl"`.
8. **Mobile-first:** design at 390px first. Do not touch the mobile dividers.
9. **Copy:** Hebrew, gender-neutral plural, no slash-gender forms.

## 5. Enforcement
- `npm run lint:design` (`scripts/design-lint.mjs`) runs in CI ("Web tests") and inside `npm run test` (`tests/design-lint.test.ts`). It fails on new white, raw hex, arbitrary Tailwind colors or raw styled `<button>`. Existing debt is frozen in `scripts/design-lint-baseline.json` and may only shrink; after you remove debt, run `node scripts/design-lint.mjs --update`.
- Exception: put `// design-lint-allow: <reason>` on the line above. Reviewers must accept the reason.

## 6. Design parity review (mandatory for every UI PR)
Before shipping, compare each new or changed screen with **the landing page** and **the closest existing product screen**. Attach a side-by-side (mobile 390px + desktop) to the PR.
- [ ] Tokens only. No white, no raw hex, no banned gradients.
- [ ] Shared primitives, no hand-styled buttons, cards or inputs.
- [ ] Typography and radius scale per §4.
- [ ] Spacing rhythm matches neighboring screens.
- [ ] Motion is purposeful and honors reduced-motion.
- [ ] RTL composition correct.
- [ ] Mobile 390px checked first.
- [ ] Contrast at WCAG AA.
- [ ] "Would this impress someone who has seen Apple, Linear or Stripe?"
- [ ] New creative ideas beyond the canonical style ship as a **sketch for approval first**, not as code.

## Palette reset (root cause of the "white debt")
`app/globals.css` starts `@theme` with `--color-*: initial;`. Tailwind's generic palette (`white`, `black`, `gray`, `slate`, `zinc`, `neutral`, `stone`, `red`, `emerald`, `teal`, `amber`, `violet`, …) **no longer exists** — `bg-white`, `text-slate-600`, `bg-emerald-50` will not generate CSS. Only NuraWell tokens exist:

| Need | Token |
|---|---|
| Dark shells | `forest-600…950` |
| Product surfaces | `glass`, `glass-hi`, `surface`, `surface-elevated`, `surface-sunken`, `canvas`, `hairline` |
| Text on light | `ink`, `ink-soft`, `ink-faint`, `ink-50…950` (forest-tinted neutrals, replaces slate/gray) |
| Text on dark | `on-dark`, `on-dark-soft` (the **only** white) |
| Brand ramps | `primary` (mint/emerald), `secondary` (teal), `brand`, `glow`, `glow-teal` |
| Accent | `accent` (amber), `energy` (orange) |
| Semantic | `success*`, `warning*`, `coral` (error/rose), `iris` (premium/violet) |
| Utility | `transparent`, `current`, `inherit` |

Ramp steps 50/100 were lifted to tinted values (L ≤ ~94%) so no ramp can produce a flat near-white fill.
Codemod used once: `scripts/codemod-palette.mjs` (emerald→primary, teal/cyan/sky/blue→secondary, amber/yellow→accent, orange→energy, rose/red/pink→coral, violet/indigo/purple/fuchsia→iris, slate/gray/zinc/neutral/stone→ink, black→forest-950, text-white→text-on-dark, bg-white→bg-glass, bg-white/≤30→bg-on-dark/N).

## Near-white guard
`scripts/near-white.mjs` (tested in `tests/near-white.test.ts`) is part of design-lint (`nearWhite` rule). It flags: `#fff`-like hex/rgb/hsl/oklch with lightness > 96% and alpha ≥ 0.6, `bg-white`, `bg-white/60+`, `bg-on-dark/60+`, gradients ending in white, `background: white` / `'white'` in inline styles, and any theme alias whose value is near-white. Translucent highlights (`rgba(255,255,255,<0.6)`, `bg-on-dark/5…30` on dark) stay allowed.

## iOS-refined primitives (`components/ui`) — build only from these
| Primitive | Use | Do | Don't |
|---|---|---|---|
| `GlassCard` (`tone="light"｜"dark"`, `accent`) | Any card | `<GlassCard className="p-4">` | `<div className="rounded-xl bg-glass shadow">` hand-rolled |
| `Tile` (`tone="glass"｜"forest"`, `accent="glow"｜"amber"`, `label`) | Small fact tiles in cards ("הצעד הבא", "ביום קשה") | `<Tile accent="amber" label="ביום קשה">…</Tile>` | Flat cream/mint boxes |
| `Pill` (`forest｜mint｜amber｜glass`) | Static status ("המיקוד", "הותאם") | `<Pill tone="mint">הותאם</Pill>` | `bg-cream` / `bg-primary-50` pills |
| `Chip` (`mint｜amber｜forest`) | Tappable choices ≥ 40px ("קל לי", "גם זה קשה לי") | `<Chip tone="amber">…</Chip>` | `active:scale` without `motion-safe:` |
| `SectionHeader` | Section title + caption + action | `<SectionHeader title="התוכנית" />` | Ad-hoc `h2` sizes |
| `Sheet` / `Dialog` | Bottom sheet / modal | `<Sheet open title>` | `window.alert/confirm/prompt` |
| `Input` | Fields (dark well inside `.surface-dark` / `.onboarding-shell-dark`) | `<Input />` | White inputs |
| `Button` variants | All actions | `<Button variant="primary">` | Raw `<button className=…>` |
| `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton` | Empty/error/loading | — | Spinners on white |
| `Toast` | Transient status (`role=status`) | `<Toast tone="success">נשמר</Toast>` | Native alerts |

Shared rules: radii 16–28px, `backdrop-blur-xl`, inner highlight `inset 0 1px 0 rgba(238,244,234,.4–.55)`, layered shadows (1–2px contact + soft 10–36px), press = `motion-safe:active:scale-[0.97]` + `motion-reduce:transition-none`. Contrast AA: `text-ink*` on glass, `text-on-dark*` on forest.
