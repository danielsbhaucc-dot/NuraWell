export const VAULT_KINDS = ['id', 'passport', 'card', 'bank', 'address', 'phone', 'other'] as const;
export type VaultKind = (typeof VAULT_KINDS)[number];
export const VAULT_KIND_LABEL: Record<VaultKind, string> = {
  id: 'תעודת זהות', passport: 'דרכון', card: 'כרטיס אשראי', bank: 'חשבון בנק', address: 'כתובת', phone: 'טלפון', other: 'פרט אישי',
};

