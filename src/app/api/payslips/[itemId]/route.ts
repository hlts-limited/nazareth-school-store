import { NextResponse } from "next/server";
import { getViewer } from "@/modules/auth";
import { payslipItem, payslipPdf } from "@/modules/payroll";

/** A payslip PDF: for the staff member themselves once the run is approved, or for payroll staff. ?print=1 opens it to print. */
export async function GET(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const v = await getViewer();
  if (!v) return new NextResponse("Sign in required", { status: 401 });
  if (v.kind !== "staff") return new NextResponse("Not allowed", { status: 403 });
  const it = await payslipItem((await params).itemId);
  if (!it) return new NextResponse("Not found", { status: 404 });
  const approved = ["APPROVED", "PAID", "LOCKED"].includes(it.run.status);
  const own = it.employee.userId === v.user.id;
  if (!approved || (!own && !v.permissions.has("payroll.view"))) return new NextResponse("Not found", { status: 404 });
  const pdf = await payslipPdf(it.id);
  const how = new URL(req.url).searchParams.get("print") === "1" ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(pdf.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${how}; filename="${pdf.name}"`, "Cache-Control": "private, no-store" } });
}
