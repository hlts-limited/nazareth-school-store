import { NextResponse } from "next/server";
import { auditActor, getViewer } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { readBackupFile } from "@/modules/backup";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v || v.kind !== "staff" || !v.permissions.has("backup.manage")) return new NextResponse("Not allowed", { status: 403 });
  const f = await readBackupFile((await params).id);
  if (!f) return new NextResponse("Not found", { status: 404 });
  await audit(await auditActor(v), "Downloaded backup", "Backup", f.backup.id, { file: f.backup.fileName });
  return new NextResponse(new Uint8Array(f.buf), {
    headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${f.backup.fileName}"`, "Cache-Control": "private, no-store" },
  });
}
