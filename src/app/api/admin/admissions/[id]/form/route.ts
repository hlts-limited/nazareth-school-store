import { NextResponse } from "next/server";
import { getViewer } from "@/modules/auth";
import { applicationFormPdf } from "@/modules/admissions";

/** Staff print a family's completed application form. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return new NextResponse("Sign in required", { status: 401 });
  if (v.kind !== "staff" || !v.permissions.has("admissions.view")) return new NextResponse("Not allowed", { status: 403 });
  try {
    const pdf = await applicationFormPdf((await params).id);
    return new NextResponse(new Uint8Array(pdf.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.name}"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") return new NextResponse("Not found", { status: 404 });
    throw e;
  }
}
