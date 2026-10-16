import { NextResponse } from "next/server";
import { applicationByToken, applicationFormPdf } from "@/modules/admissions";

/** The completed application form to print, from the family's private link. Opens in the browser's PDF viewer. */
export async function GET(_: Request, { params }: { params: Promise<{ number: string; token: string }> }) {
  const { number, token } = await params;
  const app = await applicationByToken(number, token);
  if (!app) return new NextResponse("Not found", { status: 404 });
  const pdf = await applicationFormPdf(app.id);
  return new NextResponse(new Uint8Array(pdf.bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.name}"`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}
