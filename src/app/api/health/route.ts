import { NextResponse } from "next/server";
import { db } from "@/shared/lib/db";

/** For uptime monitors: checks the app and the database are reachable */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
