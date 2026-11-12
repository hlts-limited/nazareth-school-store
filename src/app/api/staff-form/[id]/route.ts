import { NextResponse } from "next/server";
import { auditActor, getViewer } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { employeeOwner, staffFormPdf } from "@/modules/hr";

/**
 * A staff member's filled-in record as a PDF, with their passport photograph. For the person themselves, or anyone who
 * can see all staff records (HR, Accounts, Super Admin). Head teachers can't: their view leaves out tax
 * details. Salary and bank lines follow the viewer's permissions. Every download is logged. ?print=1 opens it to print.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return new NextResponse("Sign in required", { status: 401 });
  if (v.kind !== "staff") return new NextResponse("Not allowed", { status: 403 });
  const id = (await params).id;
  const userId = await employeeOwner(id);
  if (!userId) return new NextResponse("Not found", { status: 404 });
  const own = userId === v.user.id;
  if (!own && !v.permissions.has("hr.view")) return new NextResponse("Not allowed", { status: 403 });

  const pdf = await staffFormPdf(id, {
    salary: own || v.permissions.has("hr.salary"),
    bank: own || v.permissions.has("hr.salary") || v.permissions.has("hr.bank.approve"),
  });
  if (!pdf) return new NextResponse("Not found", { status: 404 });
  await audit(await auditActor(v), "Downloaded staff form", "Employee", id, { staffCode: pdf.staffCode, own });
  const how = new URL(req.url).searchParams.get("print") === "1" ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(pdf.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${how}; filename="${pdf.name}"`, "Cache-Control": "private, no-store" } });
}
