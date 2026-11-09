# @core/a11y-kit

## 0.2.0
- `mountA11yWidget`: framework-agnostic widget (round FAB + swipe-down bottom sheet, Hebrew copy, no native dialogs, no outside fonts).
- All 12 Maaser Yashar PR #6 fixes ported (see README mapping table), plus HC status colors and Space double-fire fix.
- FAB safe area: `--a11y-fab-reserve-*` / `--a11y-fab-lift` vars, `fabReserveCss`, auto-lift over pinned bottom controls, `findFabOverlaps` test helper.
- Themes: `NURAWELL_THEME` (dark green/teal glass, Heebo/Rubik via host vars), `NEHORA_THEME` placeholder; theme `fab` and `glass` tokens.
- Self-hosted Alef (OFL) in `assets/fonts`.
- Demo + Playwright e2e (axe 0, no overflow at 320/360/390 × text/zoom 130% and 1440, keyboard, swipe), run in CI.

## 0.1.0
- First release, extracted from the Maaser Yashar accessibility panel (fix/a11y-core-c1).
- `defineA11yTheme`, `validateTheme`, `applyConsoleOverrides`, `CONSOLE_FIELDS`, `themeToCssVars`, `themeToCss`, `panelZoom`, `effectiveFeatures`.
- Contrast rules (AA 4.5 / UI 3, high contrast 7:1), real light high-contrast palette, legal floor always on, fail-open gating.
