import { NextResponse } from "next/server";
import { auditActor, getViewer } from "@/modules/auth";
import { audit, listAudit } from "@/modules/audit";
import { auditFilterFrom, type AuditParams } from "../_filter";

const MAX = 100_000;
const cell = (v: unknown) => {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Quote everything; stop spreadsheet apps treating a value as a formula
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** The audit log (with the page's filters) as CSV. Alpha Admin only; the export itself is logged. */
export async function GET(req: Request) {
  const v = await getViewer();
  if (!v || v.kind !== "staff" || !v.permissions.has("system.alpha")) return new NextResponse("Not allowed", { status: 403 });
  const p = Object.fromEntries(new URL(req.url).searchParams) as AuditParams;
  const { rows, total } = await listAudit({ ...auditFilterFrom(p), take: MAX });
  await audit(await auditActor(v), "Alpha: exported audit log", "AuditLog", null, { filters: { ...p }, rows: rows.length });
  const lines = [
    ["Time (UTC)", "Who", "Role", "Action", "Record type", "Record id", "Details", "IP"].map(cell).join(","),
    ...rows.map((a) => [a.createdAt.toISOString(), a.actorName, a.actorRole, a.action, a.entity, a.entityId, a.details, a.ip].map(cell).join(",")),
  ];
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${stamp}${total > MAX ? "-first-100000" : ""}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
