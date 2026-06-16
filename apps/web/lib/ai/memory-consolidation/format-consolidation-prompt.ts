/**
 * בניית פרומפט ל-Memory Manager — דגש על ציר זמן (created_at / updated_at).
 */

import type { PendingChatLogRow } from './types';
import type { InsightForConsolidation } from './types';

export function formatExistingInsightsBlock(insights: InsightForConsolidation[]): string {
  if (!insights.length) return 'אין תובנות פעילות במערכת.';

  return insights
    .map((row) => {
      const lines = [
        `- id=${row.id}`,
        `  status=${row.status}`,
        `  category=${row.category}`,
        `  created_at=${row.created_at}`,
        `  updated_at=${row.updated_at}`,
        `  text="${row.insight_text.replace(/"/g, "'")}"`,
      ];
      if (row.metadata?.verify_prompt) {
        lines.push(`  pending_verify="${String(row.metadata.verify_prompt).replace(/"/g, "'")}"`);
      }
      return lines.join('\n');
    })
    .join('\n');
}

export function formatPendingChatsBlock(logs: PendingChatLogRow[]): string {
  if (!logs.length) return "אין צ'אטים חדשים.";

  return logs
    .map((log, i) => {
      const header = `--- log #${i + 1} | queued_at=${log.created_at} | id=${log.id} ---`;
      return `${header}\n${log.raw_chat_text.trim()}`;
    })
    .join('\n\n');
}

export function buildConsolidationUserPrompt(params: {
  insights: InsightForConsolidation[];
  pendingLogs: PendingChatLogRow[];
}): string {
  return [
    '=== תובנות קיימות (לפי ציר זמן — created_at/updated_at קובעים סדר אירועים) ===',
    formatExistingInsightsBlock(params.insights),
    '',
    "=== צ'אטים חדשים מהיום (טריים יותר — גוברים על מידע ישן בסתירה) ===",
    formatPendingChatsBlock(params.pendingLogs),
    '',
    'החזר רק את מערך הפעולות הנדרש לשמירה על זיכרון מדויק ונקי.',
  ].join('\n');
}
