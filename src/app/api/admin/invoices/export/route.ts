import { NextResponse } from "next/server";
import { db } from "@/shared/lib/db";
import { isoDay, slugify } from "@/shared/lib/format";
import { auditActor, getViewer } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { INVOICE_LABELS, type InvoiceLabel } from "@/modules/orders";
import { invoiceRows, toCsv, toPdf, toXlsx } from "@/modules/payments";

/** Export exactly what the Invoices page is showing: ?format=xlsx|csv|pdf&cls=&from=&to=&status=&q= */
export async function GET(req: Request) {
  const v = await getViewer();
  if (!v || v.kind !== "staff" || !v.permissions.has("invoices.export")) return new NextResponse("Not allowed", { status: 403 });
  const u = new URL(req.url);
  const format = u.searchParams.get("format") ?? "xlsx";
  const statusParam = u.searchParams.get("status") ?? "";
  const f = {
    classId: u.searchParams.get("cls") || undefined,
    from: u.searchParams.get("from") || undefined,
    to: u.searchParams.get("to") || undefined,
    status: (INVOICE_LABELS as string[]).includes(statusParam) ? (statusParam as InvoiceLabel) : undefined,
    q: u.searchParams.get("q") || undefined,
  };
  const rows = await invoiceRows(f);
  const cls = f.classId ? (await db.class.findUnique({ where: { id: f.classId } }))?.name : undefined;
  const base = `invoices_${cls ? slugify(cls) : "all-classes"}_${f.from ?? "start"}_to_${f.to ?? isoDay()}_${f.status ? slugify(f.status) : "all"}`;
  const title = `Invoices · ${cls ?? "All classes"} · ${f.from ?? "start"} to ${f.to ?? isoDay()} · ${f.status ?? "All statuses"}`;
  await audit(await auditActor(v), "Exported invoices", "Invoice", null, { format, rows: rows.length, filters: f });

  if (format === "csv") return file(Buffer.from(toCsv(rows), "utf8"), `${base}.csv`, "text/csv; charset=utf-8");
  if (format === "pdf") return file(await toPdf(rows, title), `${base}.pdf`, "application/pdf");
  return file(await toXlsx(rows, title), `${base}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function file(buf: Buffer, name: string, type: string) {
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" } });
}
