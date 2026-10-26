'use client';
import { useState } from 'react';

/** Shows a buyer access key exactly once. We keep only its fingerprint, so it cannot be shown again. */
export function OneTimeKey({ secret, installId }: { secret: string; installId?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(installId ? `${installId}\n${secret}` : secret).then(() => setCopied(true), () => setCopied(false));
  return (
    <div className="fd-key">
      <p><b>מפתח הגישה של הקונה.</b> מוצג רק עכשיו, אחר כך אי אפשר לראות אותו שוב. מעבירים אותו לקונה.</p>
      <code className="fd-mono" dir="ltr">{secret}</code>
      <button type="button" className="fd-btn fd-btn-wide" onClick={copy}>{copied ? '✓ הועתק' : 'העתקת המפתח'}</button>
    </div>
  );
}
