/**
 * כתובת הבסיס ל-trigger של Workflow (חייבת להיות נגישה מ-Upstash/QStash).
 */
export function workflowPublicBaseUrl(): string {
  const explicit = process.env.WORKFLOW_PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;

  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (app) return app.replace(/\/$/, '');

  return 'http://localhost:3000';
}
