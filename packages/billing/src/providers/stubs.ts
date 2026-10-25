import { NotImplementedProviderError, type InvoiceProvider, type PaymentProvider } from './types';

/**
 * Placeholders for real processors. Every method throws: no fake success, ever.
 * Required env + webhook per provider are listed in docs/billing/PROVIDER_INTEGRATION.he.md.
 */
export const PROVIDER_REQUIREMENTS = {
  cardcom: { env: ['CARDCOM_TERMINAL_NUMBER', 'CARDCOM_API_NAME', 'CARDCOM_API_PASSWORD', 'BILLING_WEBHOOK_SECRET'], webhook: '/api/v1/billing/webhook/cardcom' },
  tranzila: { env: ['TRANZILA_TERMINAL', 'TRANZILA_APP_KEY', 'TRANZILA_SECRET', 'BILLING_WEBHOOK_SECRET'], webhook: '/api/v1/billing/webhook/tranzila' },
  grow: { env: ['GROW_PAGE_CODE', 'GROW_USER_ID', 'GROW_API_KEY', 'BILLING_WEBHOOK_SECRET'], webhook: '/api/v1/billing/webhook/grow' },
  payplus: { env: ['PAYPLUS_API_KEY', 'PAYPLUS_SECRET_KEY', 'PAYPLUS_PAGE_UID', 'BILLING_WEBHOOK_SECRET'], webhook: '/api/v1/billing/webhook/payplus' },
} as const;
export const INVOICE_REQUIREMENTS = {
  greeninvoice: { env: ['GREENINVOICE_API_ID', 'GREENINVOICE_API_SECRET'] },
  icount: { env: ['ICOUNT_COMPANY_ID', 'ICOUNT_USER', 'ICOUNT_PASS'] },
} as const;

function stubPayment(name: keyof typeof PROVIDER_REQUIREMENTS): PaymentProvider {
  const no = (what: string) => async () => { throw new NotImplementedProviderError(name, what); };
  return { name, implemented: false, createCheckout: no('createCheckout'), chargeRecurring: no('chargeRecurring'), cancel: no('cancel'), refund: no('refund'), parseWebhook: no('parseWebhook') };
}
function stubInvoice(name: keyof typeof INVOICE_REQUIREMENTS): InvoiceProvider {
  const no = (what: string) => async () => { throw new NotImplementedProviderError(name, what); };
  return { name, implemented: false, issueInvoiceReceipt: no('issueInvoiceReceipt'), issueCreditNote: no('issueCreditNote') };
}

export const CardcomProvider = () => stubPayment('cardcom');
export const TranzilaProvider = () => stubPayment('tranzila');
export const GrowProvider = () => stubPayment('grow');
export const PayPlusProvider = () => stubPayment('payplus');
export const GreenInvoiceProvider = () => stubInvoice('greeninvoice');
export const ICountProvider = () => stubInvoice('icount');
