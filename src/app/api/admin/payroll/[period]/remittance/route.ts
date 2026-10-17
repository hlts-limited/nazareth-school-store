import { NextResponse } from "next/server";
import { getViewer } from "@/modules/auth";
import { remittanceXlsx, REMITTANCES, type Remittance } from "@/modules/payroll";

/** The month's pension, NHF, NHIS or PAYE schedule as Excel, for the Bursar to remit. */
export async function GET(req: Request, { params }: { params: Promise<{ period: string }> }) {
  const v = await getViewer();
  if (!v) return new NextResponse("Sign in required", { status: 401 });
  if (v.kind !== "staff" || !v.permissions.has("payroll.view")) return new NextResponse("Not allowed", { status: 403 });
  const type = new URL(req.url).searchParams.get("type") as Remittance;
  if (!REMITTANCES.some(([k]) => k === type)) return new NextResponse("Choose pension, nhf, nhis or paye", { status: 400 });
  try {
    const x = await remittanceXlsx((await params).period, type);
    return new NextResponse(new Uint8Array(x.bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${x.name}"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    if ((e as Error).message === "NOT_APPROVED") return new NextResponse("Remittance files are ready once the run is approved.", { status: 404 });
    if ((e as { code?: string }).code === "P2025") return new NextResponse("Not found", { status: 404 });
    throw e;
  }
}
