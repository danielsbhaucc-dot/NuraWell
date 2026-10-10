import type { ModelMessage } from 'ai';

/**
 * AI SDK 7 rejects `role: 'system'` inside `messages` by default.
 * Moves leading/embedded system messages (trusted, server-built) into `instructions`,
 * keeping their order, so prompts stay identical to v6 behaviour.
 */
export function splitSystemMessages(messages: ModelMessage[]): {
  instructions: string | undefined;
  messages: ModelMessage[];
} {
  const system: string[] = [];
  const rest: ModelMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      system.push(typeof m.content === 'string' ? m.content : String(m.content));
    } else {
      rest.push(m);
    }
  }
  return { instructions: system.length ? system.join('\n\n') : undefined, messages: rest };
}
