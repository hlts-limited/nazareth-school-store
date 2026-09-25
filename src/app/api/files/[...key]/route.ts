import { NextResponse } from "next/server";
import { db } from "@/shared/lib/db";
import { sniffType, storage } from "@/shared/lib/storage";
import { getViewAs, getViewer } from "@/modules/auth";

/** Serves stored files. Product photos are public; receipts only for the parent who uploaded them and accounts staff. */
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (key.startsWith("items/")) return serve(key, "public, max-age=31536000, immutable");
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
