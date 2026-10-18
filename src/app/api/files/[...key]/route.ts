import { NextResponse } from "next/server";
import { db } from "@/shared/lib/db";
import { sniffType, storage } from "@/shared/lib/storage";
import { auditActor, getViewAs, getViewer } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { isSensitiveDoc, staffDocLabel } from "@/modules/hr";

/** Serves stored files. Product, gallery and event photos are public; receipts only for the parent who uploaded them and accounts staff;
 *  admission documents only for admissions staff. */
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (key.startsWith("items/") || key.startsWith("gallery/") || key.startsWith("events/")) return serve(key, "public, max-age=31536000, immutable");
  if (key.startsWith("admissions/")) {
    const v = await getViewer();
    if (!v) return new NextResponse("Sign in required", { status: 401 });
    if (v.kind !== "staff" || !v.permissions.has("admissions.view")) return new NextResponse("Not allowed", { status: 403 });
    return serve(key, "private, no-store");
  }
  if (key.startsWith("attendance/")) {
    // Clock-in photos: the staff member and those allowed to review photos (the review page logs each look)
    const v = await getViewer();
    if (!v) return new NextResponse("Sign in required", { status: 401 });
    if (v.kind !== "staff") return new NextResponse("Not allowed", { status: 403 });
    const rec = await db.attendance.findFirst({ where: { OR: [{ inPhotoKey: key }, { outPhotoKey: key }] }, include: { employee: true } });
    if (!rec) return new NextResponse("Not found", { status: 404 });
    if (rec.employee.userId !== v.user.id && !v.permissions.has("attendance.photos")) return new NextResponse("Not allowed", { status: 403 });
    return serve(key, "private, no-store");
  }
  if (key.startsWith("staff/")) {
    // Staff documents: the staff member, HR and the Proprietor/Bursar. Every view of an ID or guarantor form is logged.
    const v = await getViewer();
    if (!v) return new NextResponse("Sign in required", { status: 401 });
    if (v.kind !== "staff") return new NextResponse("Not allowed", { status: 403 });
    const doc = await db.employeeDocument.findFirst({ where: { fileKey: key }, include: { employee: true } });
    if (!doc) return new NextResponse("Not found", { status: 404 });
    const own = doc.employee.userId === v.user.id;
    if (!own && !v.permissions.has("hr.view")) return new NextResponse("Not allowed", { status: 403 });
    if (isSensitiveDoc(doc.kind) && !own) await audit(await auditActor(v), "Viewed sensitive staff document", "Employee", doc.employeeId, { staffCode: doc.employee.staffCode, kind: staffDocLabel(doc.kind) });
    return serve(key, "private, no-store");
  }
  if (!key.startsWith("receipts/")) return new NextResponse("Not found", { status: 404 });

  const v = await getViewer();
  if (!v) return new NextResponse("Sign in required", { status: 401 });
  const orderId = key.split("/")[1];
  let allowed = false;
  if (v.kind === "staff" && v.permissions.has("payments.review")) allowed = true;
  if (v.kind === "staff") {
    const va = await getViewAs();
    if (va?.targetKind === "parent") allowed = allowed || !!(await db.order.findFirst({ where: { id: orderId, parentId: va.targetId } }));
  }
  if (v.kind === "parent") allowed = !!(await db.order.findFirst({ where: { id: orderId, parentId: v.user.id } }));
  if (!allowed) return new NextResponse("Not allowed", { status: 403 });
  return serve(key, "private, no-store");
}

async function serve(key: string, cache: string) {
  const buf = await storage().get(key);
  if (!buf) return new NextResponse("Not found", { status: 404 });
  const t = sniffType(buf);
  const headers: Record<string, string> = {
    "Content-Type": t?.mime ?? "application/octet-stream",
    "Cache-Control": cache,
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN", // lets the review screen show PDF receipts
  };
  if (t?.mime !== "application/pdf") headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";
  return new NextResponse(new Uint8Array(buf), { headers });
}
