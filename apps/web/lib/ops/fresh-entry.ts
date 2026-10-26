/** OPS_REQUIRE_FRESH_ENTRY: off by default. Turn on only after the owner has backup codes, or a lost device means lock-out. */
export function opsFreshEntryRequired(): boolean {
  return process.env.OPS_REQUIRE_FRESH_ENTRY === 'on';
}
