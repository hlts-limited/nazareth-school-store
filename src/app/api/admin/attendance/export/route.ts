import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/shared/lib/db";
import { getViewer } from "@/modules/auth";
import { sectionName } from "@/modules/hr";
import { lagosDate, monthTotals } from "@/modules/attendance";

/** A month's attendance per staff member, as Excel. */
export async function GET(req: Request) {
  const v = await getViewer();
  if (!v) return new NextResponse("Sign in required", { status: 401 });
  if (v.kind !== "staff" || !v.permissions.has("attendance.manage")) return new NextResponse("Not allowed", { status: 403 });
  const q = new URL(req.url).searchParams.get("m") ?? "";
  const m = /^\d{4}-\d{2}$/.test(q) ? q : lagosDate().slice(0, 7);
  const [staff, totals] = await Promise.all([
    db.employee.findMany({ where: { status: "ACTIVE" }, include: { user: { select: { firstName: true, lastName: true } } }, orderBy: [{ section: "asc" }, { staffCode: "asc" }] }),
    monthTotals(m),
  ]);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Attendance ${m}`);
  ws.columns = [
    { header: "Staff code", key: "code", width: 12 }, { header: "Name", key: "name", width: 28 }, { header: "Section", key: "section", width: 24 },
    { header: "Position", key: "position", width: 20 }, { header: "On time", key: "p", width: 10 }, { header: "Late", key: "l", width: 8 },
    { header: "Absent", key: "a", width: 8 }, { header: "On leave", key: "lv", width: 10 }, { header: "Holiday", key: "h", width: 9 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const e of staff) {
    const t = totals.get(e.id);
    ws.addRow({ code: e.staffCode, name: `${e.user.firstName} ${e.user.lastName}`, section: sectionName(e.section), position: e.position, p: t?.PRESENT ?? 0, l: t?.LATE ?? 0, a: t?.ABSENT ?? 0, lv: t?.LEAVE ?? 0, h: t?.HOLIDAY ?? 0 });
  }
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="attendance-${m}.xlsx"`, "Cache-Control": "private, no-store" },
  });
}
