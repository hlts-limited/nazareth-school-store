import { NextResponse } from "next/server";
import { db } from "@/shared/lib/db";
import { parseOrderNo } from "@/shared/lib/format";
import { getViewAs, getViewer } from "@/modules/auth";
import { orderInvoicePdf } from "@/modules/payments";

export async function GET(_: Request, { params }: { params: Promise<{ no: string }> }) {
  const n = parseOrderNo((await params).no);
  const v = await getViewer();
  if (!v) return new NextResponse("Sign in required", { status: 401 });
  if (!n) return new NextResponse("Not found", { status: 404 });
  const order = await db.order.findUnique({ where: { number: n } });
  if (!order) return new NextResponse("Not found", { status: 404 });
  let allowed = v.kind === "parent" && order.parentId === v.user.id;
  if (v.kind === "staff") {
    const va = await getViewAs();
    allowed = v.permissions.has("invoices.manage") || (va?.targetKind === "parent" && va.targetId === order.parentId);
  }
  if (!allowed) return new NextResponse("Not allowed", { status: 403 });
  const pdf = await orderInvoicePdf(order.id);
  return new NextResponse(new Uint8Array(pdf.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${pdf.name}"`, "Cache-Control": "private, no-store" } });
}
