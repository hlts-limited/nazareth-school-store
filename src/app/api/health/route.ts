import { NextResponse } from "next/server";
import { databaseReachable } from "@/shared/lib/db";

/** For uptime monitors: checks the app and the database are reachable */
export async function GET() {
  return (await databaseReachable()) ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false }, { status: 503 });
}
