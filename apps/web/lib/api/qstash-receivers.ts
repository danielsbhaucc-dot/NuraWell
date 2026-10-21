import { Receiver } from '@upstash/qstash';

/**
 * Dual-account QStash signature verification (account migration).
 *
 * Primary pair: QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY.
 * Legacy pair (transition only): QSTASH_OLD_CURRENT_SIGNING_KEY / QSTASH_OLD_NEXT_SIGNING_KEY.
 * A request is valid if ANY configured pair verifies it. Remove the OLD vars once the
 * old account is fully drained to go back to a single pair.
 */
export function qstashReceivers(env: NodeJS.ProcessEnv = process.env): Receiver[] {
  const pairs: Array<[string | undefined, string | undefined]> = [
    [env.QSTASH_CURRENT_SIGNING_KEY?.trim(), env.QSTASH_NEXT_SIGNING_KEY?.trim()],
    [env.QSTASH_OLD_CURRENT_SIGNING_KEY?.trim(), env.QSTASH_OLD_NEXT_SIGNING_KEY?.trim()],
  ];
  const out: Receiver[] = [];
  for (const [current, next] of pairs) {
    if (!current) continue;
    out.push(new Receiver({ currentSigningKey: current, nextSigningKey: next || current }));
  }
  return out;
}

type VerifyArgs = Parameters<Receiver['verify']>[0];

/** Returns true if any configured key pair verifies the signature; never throws. */
export async function verifyQstashAny(args: VerifyArgs, receivers = qstashReceivers()): Promise<boolean> {
  for (const r of receivers) {
    try {
      if (await r.verify(args)) return true;
    } catch {
      /* try next pair */
    }
  }
  return false;
}

/** Receiver-compatible object for `serve(..., { receiver })` in @upstash/workflow. */
export function multiQstashReceiver(): { verify: Receiver['verify'] } | undefined {
  const receivers = qstashReceivers();
  if (receivers.length === 0) return undefined;
  return {
    verify: async (args: VerifyArgs) => {
      if (await verifyQstashAny(args, receivers)) return true;
      throw new Error('Invalid QStash signature');
    },
  };
}

/** Options fragment for `serve()`: only sets `receiver` when keys exist (keeps library default otherwise). */
export function qstashWorkflowOptions(): { receiver?: { verify: Receiver['verify'] } } {
  const receiver = multiQstashReceiver();
  return receiver ? { receiver } : {};
}
