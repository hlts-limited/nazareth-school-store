import { NextResponse } from "next/server";
import { admissionLetterPdf, applicationByToken, LetterNotReady } from "@/modules/admissions";

/** The family's admission letter, from their private application link. Only after results are published. */
export async function GET(req: Request, { params }: { params: Promise<{ number: string; token: string }> }) {
  const { number, token } = await params;
  const app = await applicationByToken(number, token);
  if (!app) return new NextResponse("Not found", { status: 404 });
  try {
    const pdf = await admissionLetterPdf(app.id);
    return new NextResponse(new Uint8Array(pdf.bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `${new URL(req.url).searchParams.get("print") === "1" ? "inline" : "attachment"}; filename="${pdf.name}"`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
    });
  } catch (e) {
    if (e instanceof LetterNotReady) return new NextResponse(e.message, { status: 404 });
    throw e;
  }
}
