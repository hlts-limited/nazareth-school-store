import type { LineStatus, OrderStatus } from "@prisma/client";

export type Tone = "ok" | "warn" | "info" | "err" | "violet" | "plain";

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "warn" },
  AWAITING_VERIFICATION: { label: "Payment under review", tone: "info" },
  PAYMENT_REJECTED: { label: "Payment rejected", tone: "err" },
  PART_PAID: { label: "Part paid", tone: "warn" },
  PAYMENT_APPROVED: { label: "Payment approved", tone: "ok" },
  PACKING: { label: "Being packed", tone: "violet" },
  READY: { label: "Ready for pick-up", tone: "ok" },
  PARTIALLY_HANDED_OUT: { label: "Partly collected", tone: "violet" },
  HANDED_OUT: { label: "Collected", tone: "plain" },
  CANCELLED: { label: "Cancelled", tone: "err" },
};

export const LINE_STATUS: Record<LineStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Waiting", tone: "plain" },
  PACKING: { label: "Packing", tone: "violet" },
  READY: { label: "Ready", tone: "ok" },
  AWAITING_STOCK: { label: "Awaiting stock", tone: "warn" },
  HANDED_OUT: { label: "Collected", tone: "plain" },
  CANCELLED: { label: "Cancelled", tone: "err" },
};

export const PAID_STATUSES: OrderStatus[] = ["PAYMENT_APPROVED", "PACKING", "READY", "PARTIALLY_HANDED_OUT", "HANDED_OUT"];
export const UNPAID_STATUSES: OrderStatus[] = ["PENDING_PAYMENT", "PAYMENT_REJECTED", "PART_PAID"];
export const isPaid = (s: OrderStatus) => PAID_STATUSES.includes(s);

/** Parent-facing progress: 0 placed · 1 payment · 2 packed · 3 ready · 4 collected */
export function stepIndex(s: OrderStatus): number {
  switch (s) {
    case "PENDING_PAYMENT": case "AWAITING_VERIFICATION": case "PAYMENT_REJECTED": case "PART_PAID": return 1;
    case "PAYMENT_APPROVED": return 2;
    case "PACKING": return 2;
    case "READY": case "PARTIALLY_HANDED_OUT": return 3;
    case "HANDED_OUT": return 5;
    default: return 0;
  }
}

export type InvoiceLabel = "Approved" | "Pending" | "Part paid" | "Rejected" | "Cancelled";
export function invoiceLabel(s: OrderStatus): InvoiceLabel {
  if (isPaid(s)) return "Approved";
  if (s === "PART_PAID") return "Part paid";
  if (s === "PAYMENT_REJECTED") return "Rejected";
  if (s === "CANCELLED") return "Cancelled";
  return "Pending";
}
export const INVOICE_LABELS: InvoiceLabel[] = ["Approved", "Pending", "Part paid", "Rejected", "Cancelled"];
export function statusesFor(label: InvoiceLabel): OrderStatus[] {
  return (Object.keys(ORDER_STATUS) as OrderStatus[]).filter((s) => invoiceLabel(s) === label);
}

/** What's still owed on an order */
export const amountDue = (o: { subtotal: number; walletUsed: number; amountReceived: number }) => Math.max(0, o.subtotal - o.walletUsed - o.amountReceived);

/**
 * Apply money received against what is due.
 * - received >= due  → approved; anything extra is "excess" for the wallet
 * - received <  due  → part paid; the parent is told the balance
 */
export function settle(due: number, received: number): { outcome: "approved" | "part"; applied: number; excess: number; balance: number } {
  if (received >= due) return { outcome: "approved", applied: due, excess: received - due, balance: 0 };
  return { outcome: "part", applied: received, excess: 0, balance: due - received };
}
