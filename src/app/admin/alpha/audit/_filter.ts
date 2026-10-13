import type { AuditFilter } from "@/modules/audit";

export type AuditParams = { q?: string; who?: string; action?: string; entity?: string; from?: string; to?: string };

/** Dates are whole days in Lagos time; "to" includes the whole day. */
const day = (s?: string, plusDays = 0) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00+01:00`);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d;
};

export const auditFilterFrom = (p: AuditParams): AuditFilter => ({ q: p.q, who: p.who, action: p.action, entity: p.entity, from: day(p.from), to: day(p.to, 1) });
