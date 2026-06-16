/**
 * זיהוי קריאת recall_past_memory שעדיין לא קיבלה תוצאה — תואם AI SDK v6 (parts)
 * וגם שדה legacy toolInvocations אם קיים.
 */

const RECALL_TOOL_NAME = 'recall_past_memory';

type ToolInvocationLike = {
  toolName?: string;
  state?: string;
  result?: unknown;
};

type MessagePartLike = {
  type?: string;
  toolName?: string;
  state?: string;
  output?: unknown;
};

type MessageLike = {
  role?: string;
  parts?: MessagePartLike[];
  toolInvocations?: ToolInvocationLike[];
};

function isPendingRecallInvocation(inv: ToolInvocationLike): boolean {
  if (inv.toolName !== RECALL_TOOL_NAME) return false;
  if (inv.result !== undefined && inv.result !== null) return false;
  const state = inv.state?.toLowerCase();
  if (state === 'result' || state === 'output-available') return false;
  return true;
}

function isPendingRecallPart(part: MessagePartLike): boolean {
  const isRecallTool =
    part.type === `tool-${RECALL_TOOL_NAME}` ||
    (part.type === 'dynamic-tool' && part.toolName === RECALL_TOOL_NAME);
  if (!isRecallTool) return false;

  const state = part.state;
  if (!state) return true;
  if (state === 'output-available' || state === 'output-error' || state === 'output-denied') {
    return false;
  }
  return state === 'input-streaming' || state === 'input-available' || state === 'approval-requested';
}

export function messageHasPendingRecallTool(message: MessageLike): boolean {
  if (message.role !== 'assistant') return false;

  if (Array.isArray(message.toolInvocations)) {
    if (message.toolInvocations.some(isPendingRecallInvocation)) return true;
  }

  if (Array.isArray(message.parts)) {
    if (message.parts.some(isPendingRecallPart)) return true;
  }

  return false;
}

export function messagesHavePendingRecallTool(messages: MessageLike[]): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messageHasPendingRecallTool(messages[i]!)) return true;
    if (messages[i]?.role === 'assistant') break;
  }
  return false;
}
