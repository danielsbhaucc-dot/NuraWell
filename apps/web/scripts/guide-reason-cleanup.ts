/**
 * One-off (approved by Daniel): move leaked per-user reasons out of shared guide rows. See lib/tasks/guide-reason-cleanup.ts.
 * Run ONLY after 000212 + 000214 and the code are deployed:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... PII_ENCRYPTION_KEY=... npx jiti apps/web/scripts/guide-reason-cleanup.ts --dry-run
 *   ... npx jiti apps/web/scripts/guide-reason-cleanup.ts            (apply; add --allow-unattributed to also null unmatched rows)
 * Prints counts only. Exit 1 when verification fails (remaining > 0 or a reason does not decrypt).
 */
import { createAdminClient } from '../lib/supabase/admin';
import { runGuideReasonCleanup } from '../lib/tasks/guide-reason-cleanup';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const allowUnattributed = process.argv.includes('--allow-unattributed');
  const res = await runGuideReasonCleanup(createAdminClient() as never, { dryRun, allowUnattributed });
  console.log(JSON.stringify({ dryRun, ...res.counts, ...(res.verify ?? {}) }));
  if (res.verify && (res.verify.remaining !== 0 || !res.verify.reasons_decrypt)) process.exit(1);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : 'failed'); process.exit(1); });
