/** Every screen and server action checks one of these permissions — never a role name. */
export const PERMISSIONS = {
  PAYMENTS_REVIEW: "payments.review",
  INVOICES_MANAGE: "invoices.manage",
  INVOICES_EXPORT: "invoices.export",
  WALLETS_ADJUST: "wallets.adjust",
  CATALOGUE_MANAGE: "catalogue.manage",
  STOCK_MANAGE: "stock.manage",
  FULFILMENT_MANAGE: "fulfilment.manage",
  PUPILS_VIEW: "pupils.view",
  PUPILS_MANAGE: "pupils.manage",
  PUPILS_DELETE: "pupils.delete",
  PUPILS_EMPTY_BIN: "pupils.empty_bin",
  REPORTS_VIEW: "reports.view",
  STAFF_MANAGE: "staff.manage",
  SETTINGS_MANAGE: "settings.manage",
  SESSIONS_MANAGE: "sessions.manage",
  BACKUP_MANAGE: "backup.manage",
  VIEW_AS: "viewas.use",
  AUDIT_VIEW: "audit.view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
const P = PERMISSIONS;

export const ROLE_DEFS: { id: string; name: string; permissions: Permission[]; requires2fa: boolean }[] = [
  {
    id: "accountant", name: "Accountant", requires2fa: true,
    permissions: [P.PAYMENTS_REVIEW, P.INVOICES_MANAGE, P.INVOICES_EXPORT, P.WALLETS_ADJUST, P.PUPILS_VIEW, P.REPORTS_VIEW],
  },
  {
    id: "registrar", name: "Registrar", requires2fa: false,
    permissions: [P.CATALOGUE_MANAGE, P.STOCK_MANAGE, P.FULFILMENT_MANAGE, P.PUPILS_VIEW],
  },
  {
    id: "secretary", name: "Secretary", requires2fa: false,
    permissions: [P.PUPILS_VIEW, P.PUPILS_MANAGE, P.PUPILS_DELETE],
  },
  {
    id: "admin", name: "Super Admin", requires2fa: true,
    permissions: Object.values(P) as Permission[],
  },
];

export const roleName = (id: string) => ROLE_DEFS.find((r) => r.id === id)?.name ?? id;

/** Staff areas shown in the back office; a person sees the areas their permissions allow. */
export const STAFF_SECTIONS: { id: string; label: string; perm: Permission; items: { href: string; label: string; icon: string; badge?: "review" | "pack" | "bin" }[] }[] = [
  {
    id: "admin", label: "Super Admin", perm: P.SETTINGS_MANAGE,
    items: [
      { href: "/admin", label: "Overview", icon: "chart" },
      { href: "/admin/people", label: "View as parent / pupil", icon: "eye" },
      { href: "/admin/staff", label: "Staff & roles", icon: "shield" },
      { href: "/admin/sessions", label: "Sessions", icon: "clock" },
      { href: "/admin/backup", label: "Backup & restore", icon: "db" },
      { href: "/admin/audit", label: "Audit log", icon: "list" },
      { href: "/admin/settings", label: "Settings", icon: "cog" },
    ],
  },
  {
    id: "accounts", label: "Accountant", perm: P.PAYMENTS_REVIEW,
    items: [
      { href: "/admin/accounts", label: "Overview", icon: "chart" },
      { href: "/admin/accounts/review", label: "Payments to review", icon: "receipt", badge: "review" },
      { href: "/admin/accounts/invoices", label: "Invoices", icon: "file" },
      { href: "/admin/accounts/wallets", label: "Pupil wallets", icon: "wallet" },
    ],
  },
  {
    id: "store", label: "Registrar", perm: P.CATALOGUE_MANAGE,
    items: [
      { href: "/admin/store", label: "Overview", icon: "chart" },
      { href: "/admin/store/items", label: "Items", icon: "tag" },
      { href: "/admin/store/categories", label: "Categories", icon: "layers" },
      { href: "/admin/store/stock", label: "Stock", icon: "box" },
      { href: "/admin/store/packing", label: "Orders to pack", icon: "list", badge: "pack" },
      { href: "/admin/store/pickup", label: "Pick-up desk", icon: "qr" },
    ],
  },
  {
    id: "office", label: "Secretary", perm: P.PUPILS_MANAGE,
    items: [
      { href: "/admin/office/pupils", label: "Pupils", icon: "users" },
      { href: "/admin/office/pupils/new", label: "Add pupil", icon: "plus" },
      { href: "/admin/office/import", label: "Bulk import", icon: "upload" },
      { href: "/admin/office/bin", label: "Recently deleted", icon: "trash", badge: "bin" },
    ],
  },
];
