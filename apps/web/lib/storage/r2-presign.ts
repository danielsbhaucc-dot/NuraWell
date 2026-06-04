import { createHmac, createHash } from 'node:crypto';
import { getR2Credentials } from './r2-almog';

const REGION = 'auto';
const SERVICE = 's3';

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeQueryValue(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function signingKey(secretAccessKey: string, date: string): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
}

function amzDates(now = new Date()): { shortDate: string; longDate: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    shortDate: iso.slice(0, 8),
    longDate: iso,
  };
}

export function createR2PutPresignedUrl(params: {
  bucket: string;
  key: string;
  expiresSeconds?: number;
}): string {
  const { accountId, accessKeyId, secretAccessKey } = getR2Credentials();
  const expiresSeconds = Math.min(Math.max(params.expiresSeconds ?? 300, 60), 900);
  const { shortDate, longDate } = amzDates();
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const credentialScope = `${shortDate}/${REGION}/${SERVICE}/aws4_request`;
  const canonicalUri = `/${encodePathSegment(params.bucket)}/${params.key
    .split('/')
    .map(encodePathSegment)
    .join('/')}`;

  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': longDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQuery = Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeQueryValue(k)}=${encodeQueryValue(v)}`)
    .join('&');

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    longDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  const signature = createHmac('sha256', signingKey(secretAccessKey, shortDate))
    .update(stringToSign, 'utf8')
    .digest('hex');

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
