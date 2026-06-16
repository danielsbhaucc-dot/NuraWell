'use client';

import { DefaultChatTransport, TextStreamChatTransport, type UIMessage } from 'ai';

type TransportInit = ConstructorParameters<typeof DefaultChatTransport<UIMessage>>[0];

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
      this.useUiMessageStream =
        response.headers.get('x-ai-writer') === 'memory-recall-tools';
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
