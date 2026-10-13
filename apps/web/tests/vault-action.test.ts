import { describe, it, expect } from 'vitest';
import { parseRawChatUi, resolveChatUi, hasResolvedContent } from '@/lib/ai/chat-ui/blocks';
import { detectVaultCandidate } from '@/lib/secure-vault/detect';

describe('vault action', () => {
  it('marker opens vault with type', () => {
    const raw = parseRawChatUi('{"vault":"passport"}')!;
    const ui = resolveChatUi(raw, []);
    expect(ui.vault).toBe('passport');
    expect(hasResolvedContent(ui)).toBe(true);
    expect(parseRawChatUi('{"vault":"evil"}')!.vault).toBeNull();
  });
  it('detects sensitive typing, not normal text', () => {
    expect(detectVaultCandidate('הת"ז שלי 123456782')).toEqual({ kind: 'id', value: '123456782' });
    expect(detectVaultCandidate('כרטיס אשראי 4580 1234 5678 9123')?.kind).toBe('card');
    expect(detectVaultCandidate('ירדתי 2 קילו השבוע ואכלתי 1500 קלוריות')).toBeNull();
  });
});
