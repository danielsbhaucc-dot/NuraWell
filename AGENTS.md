
## Display order (UI modules and primitives)
- Spacing: one 4px-based scale only (`--space-1..8` = 4, 8, 12, 16, 24, 32, 48, 64px).
- Type: limited scale (`--text-xs, sm, base, lg, xl, 2xl`) with 2 weights (400/600); one h1 per view, clear hierarchy.
- Grid/alignment: 12-column grid, `--radius-sm/md/lg`, consistent start alignment (RTL-aware: logical properties only).
- No raw px/hex/font names in module CSS; tokens only. Target lint (planned): stylelint `declaration-strict-value` for color, font, spacing and radius in packages/@platform/*.
- Visual changes: screenshots to Daniel, never merged without approval.
