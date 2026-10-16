import { NextResponse } from "next/server";
import { admissionLetterPdf, applicationForDocLink, applicationFormPdf, LetterNotReady } from "@/modules/admissions";

/**
 * The admission letter or application form, from the short-lived link the results page gives a family after
 * they check their result. Opens in the browser to print; ?download=1 saves the file instead.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const found = await applicationForDocLink({ n: q.get("n"), doc: q.get("doc"), exp: q.get("exp"), sig: q.get("sig") });
  if (!found) return new NextResponse("This link has expired. Check the result again on the website to get a new one.", { status: 404 });
  try {
    const pdf = found.doc === "letter" ? await admissionLetterPdf(found.app.id) : await applicationFormPdf(found.app.id);
    const how = q.get("download") === "1" ? "attachment" : "inline";
    return new NextResponse(new Uint8Array(pdf.bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `${how}; filename="${pdf.name}"`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
    });
  } catch (e) {
    if (e instanceof LetterNotReady) return new NextResponse(e.message, { status: 404 });
    throw e;
  }
}
