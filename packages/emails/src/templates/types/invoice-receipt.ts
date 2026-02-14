export type InvoiceReceiptEmailProps = Readonly<{
  amountPaid?: string | null;
  currency?: string | null;
  interval?: string | null;
  nextBillingDate?: string | null;
  invoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  organizationName?: string;
}>;
