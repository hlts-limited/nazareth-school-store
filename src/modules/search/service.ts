import { db } from "@/shared/lib/db";
import { naira, orderNo, parseOrderNo } from "@/shared/lib/format";
import { PERMISSIONS as P } from "@/modules/access-control";
import { ORDER_STATUS } from "@/modules/orders";

export type SearchHit = { title: string; sub: string; href: string | null; tag?: string };
export type SearchGroup = { id: string; label: string; hits: SearchHit[] };

const TAKE = 8;
const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

/**
 * One search box for the whole back office. Each kind of record is searched only when the person may see it,
 * and each result links to a page they can open.
 */
export async function searchEverything(raw: string, perms: ReadonlySet<string>): Promise<SearchGroup[]> {
  const q = raw.trim();
  if (q.length < 2) return [];
  const has = (p: string) => perms.has(p);
  const words = q.split(/\s+/).filter(Boolean).slice(0, 3);
  // "Ada Okafor" should find first name Ada and surname Okafor
  const nameMatch = (first: string, last: string) => ({ AND: words.map((w) => ({ OR: [{ [first]: ci(w) }, { [last]: ci(w) }] })) });
  const groups: Promise<SearchGroup | null>[] = [];

  if (has(P.PUPILS_VIEW)) {
    groups.push(db.pupil.findMany({
      where: { deletedAt: null, OR: [nameMatch("firstName", "lastName"), { regNumber: ci(q) }] },
      include: { class: true }, take: TAKE, orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }).then((rows) => ({
      id: "pupils", label: "Pupils",
      hits: rows.map((p) => ({ title: `${p.firstName} ${p.lastName}`, sub: `${p.regNumber} · ${p.class.name}`, tag: p.status === "ACTIVE" ? undefined : "Left", href: has(P.PUPILS_MANAGE) ? `/admin/office/pupils?q=${encodeURIComponent(p.regNumber)}` : null })),
    })));
    const digits = q.replace(/\D/g, "");
    groups.push(db.user.findMany({
      where: { type: "PARENT", OR: [nameMatch("firstName", "lastName"), { email: ci(q) }, ...(digits.length >= 6 ? [{ phone: { contains: digits.slice(-10) } }] : [])] },
      include: { guardianships: { include: { pupil: true } } }, take: TAKE, orderBy: { lastName: "asc" },
    }).then((rows) => ({
      id: "parents", label: "Parents",
      hits: rows.map((u) => ({
        title: `${u.firstName} ${u.lastName}`,
        sub: [u.phone, u.guardianships.map((g) => g.pupil.firstName).join(", ")].filter(Boolean).join(" · "),
        tag: u.status === "INVITED" ? "Not signed in yet" : undefined,
        href: has(P.VIEW_AS) ? `/admin/people?q=${encodeURIComponent(u.phone ?? u.lastName)}` : has(P.PUPILS_MANAGE) && u.guardianships[0] ? `/admin/office/pupils?q=${encodeURIComponent(u.guardianships[0].pupil.regNumber)}` : null,
      })),
    })));
  }

  if (has(P.INVOICES_MANAGE) || has(P.PAYMENTS_REVIEW) || has(P.FULFILMENT_MANAGE)) {
    const n = parseOrderNo(q);
    if (n) {
      groups.push(db.order.findMany({ where: { number: n }, include: { parent: true }, take: 1 }).then((rows) => ({
        id: "orders", label: "Orders",
        hits: rows.map((o) => ({
          title: orderNo(o.number), sub: `${o.parent.firstName} ${o.parent.lastName} · ${naira(o.subtotal)}`, tag: ORDER_STATUS[o.status].label,
          href: has(P.INVOICES_MANAGE) ? `/admin/accounts/invoices?q=${orderNo(o.number)}` : o.pickupCode && has(P.FULFILMENT_MANAGE) ? `/admin/store/pickup?code=${o.pickupCode}` : null,
        })),
      })));
    }
  }

  if (has(P.HR_VIEW)) {
    groups.push(db.employee.findMany({
      where: { OR: [{ staffCode: ci(q) }, { user: nameMatch("firstName", "lastName") }, { position: ci(q) }] },
      include: { user: true }, take: TAKE, orderBy: { staffCode: "asc" },
    }).then((rows) => ({
      id: "staff", label: "Staff",
      hits: rows.map((e) => ({ title: `${e.user.firstName} ${e.user.lastName}`, sub: `${e.staffCode} · ${e.position}`, tag: e.status === "ACTIVE" ? undefined : "Left", href: `/admin/hr/${e.id}` })),
    })));
  }

  if (has(P.CATALOGUE_MANAGE)) {
    groups.push(db.item.findMany({ where: { OR: [{ name: ci(q) }, { sku: ci(q) }] }, take: TAKE, orderBy: { name: "asc" } }).then((rows) => ({
      id: "items", label: "Store items",
      hits: rows.map((i) => ({ title: i.name, sub: `${i.sku} · ${naira(i.price)}`, tag: i.isPile ? "Pile" : i.isActive ? undefined : "Hidden", href: i.isPile ? `/admin/store/piles/${i.id}` : `/admin/store/items/${i.id}` })),
    })));
  }

  if (has(P.ADMISSIONS_VIEW)) {
    groups.push(db.application.findMany({
      where: { OR: [{ number: ci(q) }, nameMatch("otherNames", "surname"), { parentName: ci(q) }] },
      take: TAKE, orderBy: { createdAt: "desc" },
    }).then((rows) => ({
      id: "applications", label: "Admission applications",
      hits: rows.map((a) => ({ title: `${a.otherNames} ${a.surname}`, sub: `${a.number} · ${a.parentName}`, tag: a.status.replace(/_/g, " ").toLowerCase(), href: `/admin/admissions/${a.id}` })),
    })));
  }

  return (await Promise.all(groups)).filter((g): g is SearchGroup => !!g && g.hits.length > 0);
}
