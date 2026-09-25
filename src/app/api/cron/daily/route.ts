import { NextResponse } from "next/server";
import { env } from "@/shared/config/env";
import { safeEqual } from "@/shared/lib/crypto";
import { runDailyJobs } from "@/modules/jobs";

/** Daily jobs. Call with header "Authorization: Bearer <CRON_SECRET>" (Vercel Cron does this automatically). */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new NextResponse("Not allowed", { status: 401 });
  const result = await runDailyJobs();
  return NextResponse.json(result);
}
