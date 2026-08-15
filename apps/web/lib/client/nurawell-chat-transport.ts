'use client';

import { DefaultChatTransport, TextStreamChatTransport, type UIMessage } from 'ai';

type TransportInit = ConstructorParameters<typeof DefaultChatTransport<UIMessage>>[0];

function isUiMessageStream(response: Response): boolean {
  if (response.headers.get('x-ai-writer') === 'memory-recall-tools') return true;
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('text/event-stream');
}

async function readFailedChatMessage(response: Response): Promise<string> {
  try {
    const data = (await response.clone().json()) as { error?: unknown; message?: unknown };
    const errorText = typeof data.error === 'string' ? data.error : '';
    const messageText = typeof data.message === 'string' ? data.message : '';
    const combined = messageText || errorText;
    if (combined && /[\u0590-\u05FF]/.test(combined)) return combined;
  } catch {
    /* גוף לא-JSON */
  }
  return '';
}

/**
 * ברירת מחדל: TextStream (OpenRouter plain text).
 * כשהשרת מחזיר UI message stream (memory recall + tools) — מפענח כ-DefaultChatTransport.
 */
export class NuraWellChatTransport extends DefaultChatTransport<UIMessage> {
  private readonly textTransport: TextStreamChatTransport<UIMessage>;
  private useUiMessageStream = false;

  constructor(options?: TransportInit) {
    const baseFetch = options?.fetch ?? fetch;

    const routingFetch: typeof fetch = async (input, init) => {
      const response = await baseFetch(input, init);
      this.useUiMessageStream = isUiMessageStream(response);
      if (!response.ok) {
        const friendly = await readFailedChatMessage(response);
        throw new Error(friendly || `chat_http_${response.status}`);
      }
      return response;
    };

    super({ ...options, fetch: routingFetch });
    this.textTransport = new TextStreamChatTransport<UIMessage>({
      ...options,
      fetch: routingFetch,
    });
  }

  protected processResponseStream(
    stream: ReadableStream<Uint8Array>
  ): ReadableStream<import('ai').UIMessageChunk> {
    if (this.useUiMessageStream) {
      return super.processResponseStream(stream);
    }
    type TextTransportWithProtected = {
      processResponseStream(
        s: ReadableStream<Uint8Array>
      ): ReadableStream<import('ai').UIMessageChunk>;
    };
    return (this.textTransport as unknown as TextTransportWithProtected).processResponseStream(
      stream
    );
  }
}
