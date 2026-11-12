import { NextResponse } from "next/server";
import { auditActor, getViewer } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { taxListScope, taxListXlsx } from "@/modules/payroll";

/** Staff and the tax (PAYE) deducted from their pay, as Excel: ?period=2026-09 for a month, ?period=2026 for a year. */
export async function GET(req: Request) {
  const v = await getViewer();
  if (!v) return new NextResponse("Sign in required", { status: 401 });
  if (v.kind !== "staff" || !v.permissions.has("payroll.view")) return new NextResponse("Not allowed", { status: 403 });
  const scope = taxListScope(new URL(req.url).searchParams.get("period") ?? "");
  if (!scope) return new NextResponse("Choose a month (2026-09) or a year (2026)", { status: 400 });
  const x = await taxListXlsx(scope);
  await audit(await auditActor(v), "Downloaded staff tax list", "PayrollRun", null, { period: scope.kind === "month" ? scope.period : scope.year, runs: x.runs });
  return new NextResponse(new Uint8Array(x.bytes), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${x.name}"`, "Cache-Control": "private, no-store" },
  });
}
