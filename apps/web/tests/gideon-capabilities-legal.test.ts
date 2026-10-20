import { describe, expect, it } from 'vitest';
import { GIDEON_CAPABILITIES, commandsManifest } from '@/lib/ceo/commands';
import { TOOL_BY_NAME } from '@/lib/ceo/tools';

describe('Gideon knows the features built for משפטי / privacy', () => {
  const ids = ['media_provenance', 'pending_licenses', 'receipts_inbound', 'legal_search', 'evidence_export', 'consent_evidence', 'cookie_notice', 'face_id_nudge', 'settings_consent_explainer', 'almog_reply_qc'];
  it('registry lists every capability and it reaches the system context', () => {
    const have = GIDEON_CAPABILITIES.map((c) => c.id);
    for (const id of ids) expect(have).toContain(id);
    const m = commandsManifest();
    expect(m).toContain('אני צריך ראיה');
    expect(m).toContain('receipts@nurawell.ai');
    expect(m).toContain('כוס לפני האוכל');
  });
  it('every referenced tool exists and the legal tools are read-only', () => {
    for (const c of GIDEON_CAPABILITIES) if (c.tool) expect(TOOL_BY_NAME.has(c.tool)).toBe(true);
    expect(TOOL_BY_NAME.get('legal_overview')!.write).toBe(false);
    expect(TOOL_BY_NAME.get('legal_search')!.write).toBe(false);
  });
});
