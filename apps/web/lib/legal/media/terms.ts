import 'server-only';
/** Provider terms library: archives each official terms page (bytes in blob store, signed + TSA/OTS), new version only on change. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { appendMediaEvidence } from './record';
import { storeMediaBlob } from './store';
import { PROVIDER_TERMS, termsAssetKey, termsChanged, type ProviderId, type TermsSnapshot } from './terms-core';

export async function loadTermsHistory(admin: SupabaseClient, provider: ProviderId): Promise<TermsSnapshot[]> {
  const { data } = await admin.from('media_evidence').select('payload_json').eq('asset_key', termsAssetKey(provider)).eq('event', 'license_snapshot').order('created_at');
  return ((data ?? []) as Array<{ payload_json: string }>).flatMap((r) => {
    try { const d = JSON.parse(r.payload_json).data; return [{ url: String(d.url), fetched_at: String(d.fetched_at), sha256: (d.blob_sha as string | null) ?? null, http_status: Number(d.http_status ?? 0) }]; } catch { return []; }
  });
}

export async function snapshotProviderTerms(admin: SupabaseClient, providers: ProviderId[] = Object.keys(PROVIDER_TERMS) as ProviderId[], fetchImpl: typeof fetch = fetch) {
  const out: Array<{ provider: ProviderId; url: string; changed: boolean; ok: boolean }> = [];
  for (const provider of providers) {
    const prev = await loadTermsHistory(admin, provider);
    for (const url of PROVIDER_TERMS[provider].urls) {
      let status = 0; let ctype: string | null = null; let buf: Buffer | null = null;
      try {
        const r = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(12_000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; NuraWell-LegalArchive/1.0)', accept: 'text/html,*/*' } });
        status = r.status; ctype = r.headers.get('content-type');
        const b = Buffer.from(await r.arrayBuffer());
        if (r.ok && b.length <= 3_000_000) buf = b;
      } catch { /* recorded as not ok */ }
      if (!buf) { out.push({ provider, url, changed: false, ok: false }); continue; }
      const blob = await storeMediaBlob(admin, buf, (ctype ?? 'text/html').split(';')[0]!);
      const sha = blob?.sha256 ?? null;
      const changed = termsChanged(prev, url, sha);
      if (changed) await appendMediaEvidence(admin, termsAssetKey(provider), 'license_snapshot', { url, provider, fetched_at: new Date().toISOString(), http_status: status, content_type: ctype, bytes: buf.length, sha256: sha, blob_sha: sha, kind: 'provider_terms' });
      out.push({ provider, url, changed, ok: !!sha });
    }
  }
  return out;
}

