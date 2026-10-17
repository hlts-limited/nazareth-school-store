import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { currentGateCode, kioskTokenValid } from "@/modules/attendance";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!(await kioskTokenValid((await params).token))) return new NextResponse("Not found", { status: 404 });
  const c = await currentGateCode();
  const img = await QRCode.toDataURL(c.code, { margin: 1, width: 640, errorCorrectionLevel: "M" });
  return NextResponse.json({ img, secondsLeft: c.secondsLeft }, { headers: { "Cache-Control": "no-store" } });
}
