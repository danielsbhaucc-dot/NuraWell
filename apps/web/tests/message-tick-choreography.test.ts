import { describe, expect, it } from 'vitest';
import {
  buildTickChoreographyTimeline,
  resolveUserMessageTickStage,
  sampleTickChoreographyDelays,
} from '../lib/client/message-tick-choreography';

describe('message tick choreography', () => {
  it('builds pending → sent → delivered → read → typing reveal', () => {
    const delays = {
      pendingMs: 100,
      sentMs: 200,
      deliveredMs: 300,
      readHoldMs: 400,
    };
    const steps = buildTickChoreographyTimeline(delays);
    expect(steps.map((s) => s.stage)).toEqual([
      'pending',
      'sent',
      'delivered',
      'read',
      'read',
    ]);
    expect(steps[4]?.revealTyping).toBe(true);
    expect(steps[3]?.atMs).toBe(600);
    expect(steps[4]?.atMs).toBe(1000);
  });

  it('samples varied positive delays', () => {
    const a = sampleTickChoreographyDelays();
    expect(a.pendingMs).toBeGreaterThan(0);
    expect(a.readHoldMs).toBeGreaterThan(a.pendingMs);
  });

  it('keeps blue read after assistant reply, not only while in flight', () => {
    const messages = [{ role: 'user' }, { role: 'assistant' }];
    expect(
      resolveUserMessageTickStage({
        index: 0,
        messages,
        inFlight: false,
        choreographyStage: 'delivered',
        offline: false,
      })
    ).toBe('read');
  });

  it('uses choreography while last user message is in flight', () => {
    const messages = [{ role: 'user' }];
    expect(
      resolveUserMessageTickStage({
        index: 0,
        messages,
        inFlight: true,
        choreographyStage: 'sent',
        offline: false,
      })
    ).toBe('sent');
  });

  it('shows clock when offline during in-flight', () => {
    const messages = [{ role: 'user' }];
    expect(
      resolveUserMessageTickStage({
        index: 0,
        messages,
        inFlight: true,
        choreographyStage: 'delivered',
        offline: true,
      })
    ).toBe('pending');
  });
});
