import { Link, Section, Text } from "@react-email/components";
import { EmailLayout } from "./_components/EmailLayout";
import type { InvoiceReceiptEmailProps } from "./types/invoice-receipt";

export default function InvoiceReceiptEmail(props: InvoiceReceiptEmailProps) {
  const {
    amountPaid,
    currency,
    interval,
    nextBillingDate,
    invoiceUrl,
    invoicePdfUrl,
    organizationName,
  } = props;

  return (
    <EmailLayout
      preview="Payment receipt"
      title="Payment receipt"
      footerHint="Thanks for your business."
    >
      <Text style={{ margin: "0 0 14px 0", color: "#374151" }}>
        Your payment was received
        {organizationName ? ` for ${organizationName}` : ""}.
      </Text>

      <Section
        style={{
          backgroundColor: "#f9fafb",
          borderRadius: "10px",
          padding: "14px 14px 6px",
          margin: "12px 0 18px",
        }}
      >
        {amountPaid && currency ? (
          <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
            <span style={{ color: "#6b7280" }}>Amount paid: </span>
            <span style={{ fontWeight: 700 }}>
              {amountPaid} {currency.toUpperCase()}
            </span>
          </Text>
        ) : null}
        {interval ? (
          <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
            <span style={{ color: "#6b7280" }}>Interval: </span>
            <span style={{ fontWeight: 700 }}>{interval}</span>
          </Text>
        ) : null}
        {nextBillingDate ? (
          <Text style={{ margin: "0 0 8px 0", color: "#111827" }}>
            <span style={{ color: "#6b7280" }}>Next billing date: </span>
            <span style={{ fontWeight: 700 }}>{nextBillingDate}</span>
          </Text>
        ) : null}
      </Section>

      {(invoiceUrl || invoicePdfUrl) && (
        <>
          <Text style={{ margin: "0 0 8px 0", color: "#374151" }}>
            Invoice links:
          </Text>
          {invoiceUrl ? (
            <Text style={{ margin: "0 0 8px 0", fontSize: "13px" }}>
              <Link
                href={invoiceUrl}
                style={{ color: "#111827", textDecoration: "underline" }}
              >
                View invoice
              </Link>
            </Text>
          ) : null}
          {invoicePdfUrl ? (
            <Text style={{ margin: 0, fontSize: "13px" }}>
              <Link
                href={invoicePdfUrl}
                style={{ color: "#111827", textDecoration: "underline" }}
              >
                Download PDF
              </Link>
            </Text>
          ) : null}
        </>
      )}
    </EmailLayout>
  );
}

InvoiceReceiptEmail.PreviewProps = {
  amountPaid: "99.00",
  currency: "usd",
  interval: "monthly",
  nextBillingDate: "2026-03-07",
  invoiceUrl: "https://dashboard.stripe.com/invoices/in_123",
  invoicePdfUrl: "https://pay.stripe.com/invoice/acct_123/pdf",
  organizationName: "Delivery Chat HQ",
} satisfies InvoiceReceiptEmailProps;
