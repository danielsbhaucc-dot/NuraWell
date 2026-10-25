/** NuraWell wiring for the product-agnostic incident-response core (lib/security-core). */
import 'server-only';
import { configureIr } from '@/lib/security-core/ir';
import { hashIp } from '@/lib/logs/signals';
import { normalizeCode, RECOVERY_LOCK_MIN, RECOVERY_MAX_FAILS } from '@/lib/ops/device-trust';

configureIr({ hashIp, normalizeCode, recoveryMaxFails: RECOVERY_MAX_FAILS, recoveryLockMin: RECOVERY_LOCK_MIN, recoveryCodeLength: 10, factorTables: ['webauthn_credentials', 'user_backup_codes'] });

export * from '@/lib/security-core/ir';
