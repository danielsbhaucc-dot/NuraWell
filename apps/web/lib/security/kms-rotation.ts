/** Non-secret identifiers for the KMS rotation job (infra/gcp-kms/rotator). Overridable by env. */
export const KMS_INTERNAL_AUDIENCE = 'https://nurawell.vercel.app/api/v1/internal/kms';
export const kmsRotatorEmail = (env: NodeJS.ProcessEnv = process.env) => env.KMS_ROTATOR_SA?.trim() || 'kms-rotator@nurawell-kms-2610.iam.gserviceaccount.com';
export const kmsRotatorUrl = (env: NodeJS.ProcessEnv = process.env) => env.KMS_ROTATOR_URL?.trim() || '';
