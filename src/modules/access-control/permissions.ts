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
  ADMISSIONS_VIEW: "admissions.view",
  ADMISSIONS_MANAGE: "admissions.manage",
  ADMISSIONS_PUBLISH: "admissions.publish",
  WEBSITE_MANAGE: "website.manage",
  // Staff app
  /** Own staff page: profile, documents, bank details (and later clock-in and payslips) */
  SELF_SERVICE: "self.service",
  /** See staff records in your own section (head teachers) */
  HR_VIEW_SECTION: "hr.view.section",
  /** See every staff record */
  HR_VIEW: "hr.view",
  /** Register staff, edit records, review documents */
  HR_MANAGE: "hr.manage",
  /** See and set salaries */
  HR_SALARY: "hr.salary",
  /** Approve staff bank details for payment */
  HR_BANK_APPROVE: "hr.bank.approve",
  /** See attendance for your own section (head teachers) */
  ATTENDANCE_VIEW_SECTION: "attendance.view.section",
  /** Today's attendance for everyone, manual clock, Close day, leave decisions, holidays, settings */
  ATTENDANCE_MANAGE: "attendance.manage",
  /** Look at clock-in photos (each view is logged) */
  ATTENDANCE_PHOTOS: "attendance.photos",
  /** See payroll runs and their figures */
  PAYROLL_VIEW: "payroll.view",
  /** Calculate and mark reviewed the three stages; set rates and tax bands */
  PAYROLL_RUN: "payroll.run",
  /** Enter penalties, waivers and bonuses (Accounts) */
  PAYROLL_PENALTIES: "payroll.penalties",
  /** Approve a run (the Super Admin; never someone who prepared it) */
  PAYROLL_APPROVE: "payroll.approve",
  /** Press Pay (the Super Admin) */
  PAYROLL_PAY: "payroll.pay",
  /** Delete a staff member for good (Alpha Admin only) */
  STAFF_DELETE: "staff.delete",
  /** Delete a store item or pile for good (Alpha Admin only) */
  ITEMS_DELETE: "catalogue.delete",
  /** Alpha Admin only: raw data editing, SQL console. Never part of a role; see ALPHA_ADMIN_EMAIL. */
  ALPHA: "system.alpha",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
const P = PERMISSIONS;

/** Only the Alpha Admin may do these: never part of any role, not even Super Admin */
export const ALPHA_ONLY: Permission[] = [P.ALPHA, P.PUPILS_DELETE, P.PUPILS_EMPTY_BIN, P.STAFF_DELETE, P.ITEMS_DELETE];

export const ROLE_DEFS: { id: string; name: string; permissions: Permission[]; requires2fa: boolean }[] = [
  {
    // One accounts office: store money, staff bank checks and preparing payroll (the Super Admin approves and pays)
    id: "accountant", name: "Accounts", requires2fa: true,
    permissions: [
      P.SELF_SERVICE, P.PAYMENTS_REVIEW, P.INVOICES_MANAGE, P.INVOICES_EXPORT, P.WALLETS_ADJUST, P.PUPILS_VIEW, P.REPORTS_VIEW,
      P.HR_VIEW_SECTION, P.HR_VIEW, P.HR_SALARY, P.HR_BANK_APPROVE, P.ATTENDANCE_VIEW_SECTION, P.PAYROLL_VIEW, P.PAYROLL_RUN, P.PAYROLL_PENALTIES,
    ],
  },
  {
    id: "registrar", name: "Registrar", requires2fa: false,
    permissions: [P.CATALOGUE_MANAGE, P.STOCK_MANAGE, P.FULFILMENT_MANAGE, P.PUPILS_VIEW],
  },
  {
    id: "secretary", name: "Secretary", requires2fa: false,
    permissions: [P.PUPILS_VIEW, P.PUPILS_MANAGE, P.ADMISSIONS_VIEW, P.ADMISSIONS_MANAGE, P.ADMISSIONS_PUBLISH, P.WEBSITE_MANAGE],
  },
  {
    id: "hr", name: "Admin / HR", requires2fa: true,
    permissions: [P.SELF_SERVICE, P.HR_VIEW_SECTION, P.HR_VIEW, P.HR_MANAGE, P.HR_SALARY, P.ATTENDANCE_VIEW_SECTION, P.ATTENDANCE_MANAGE, P.ATTENDANCE_PHOTOS, P.PAYROLL_VIEW],
  },
  {
    id: "head", name: "Head teacher", requires2fa: false,
    permissions: [P.SELF_SERVICE, P.HR_VIEW_SECTION, P.ATTENDANCE_VIEW_SECTION],
  },
  {
    id: "staff", name: "Staff", requires2fa: false,
    permissions: [P.SELF_SERVICE],
  },
  {
    id: "admin", name: "Super Admin", requires2fa: true,
    // Everything except Alpha's, including approving and paying payroll (never a run they prepared)
    permissions: (Object.values(P) as Permission[]).filter((p) => !ALPHA_ONLY.includes(p)),
  },
];

/** The Alpha Admin is the single account named by ALPHA_ADMIN_EMAIL. It has every permission, can't be given out
 *  from Staff & roles, and is shown with this pseudo-role id. */
export const ALPHA_ROLE = "alpha";
export const ALL_PERMISSIONS = Object.values(P) as Permission[];

export const roleName = (id: string) => (id === ALPHA_ROLE ? "Alpha Admin" : ROLE_DEFS.find((r) => r.id === id)?.name ?? id);

/** A menu badge: the number of things waiting in that list */
export type NavBadge = "review" | "pack" | "bin" | "apps" | "enq" | "hr" | "leave" | "payroll" | "blocked" | "returns";
export type NavItem = { href: string; label: string; icon: string; badge?: NavBadge; perm?: Permission };
/** A menu area. `perm` (any one of them) decides who sees it; each item can need its own permission too. No `perm` = all staff. */
export type NavSection = { id: string; label: string; perm?: Permission | Permission[]; items: NavItem[] };

/** The settings pages, shown as one Settings area with tabs; a person sees the tabs their permissions allow */
export const SETTINGS_TABS: NavItem[] = [
  { href: "/admin/settings", label: "School & store", icon: "cog", perm: P.SETTINGS_MANAGE },
  { href: "/admin/attendance/settings", label: "Attendance & holidays", icon: "clock", perm: P.ATTENDANCE_MANAGE },
  { href: "/admin/payroll/settings", label: "Payroll rates & tax", icon: "wallet", perm: P.PAYROLL_VIEW },
];

/** The back-office menu, named by task rather than by job title, so people with several roles find things in one place. */
export const STAFF_SECTIONS: NavSection[] = [
  {
    id: "today", label: "Today",
    items: [
      { href: "/admin", label: "My tasks", icon: "check" },
      { href: "/admin/search", label: "Search", icon: "search" },
      { href: "/admin/notifications", label: "Notifications", icon: "bell" },
    ],
  },
  {
    id: "me", label: "My work", perm: P.SELF_SERVICE,
    items: [
      { href: "/admin/me/clock", label: "Clock in / out", icon: "qr" },
      { href: "/admin/me/attendance", label: "My attendance & leave", icon: "clock" },
      { href: "/admin/me/payslips", label: "My payslips", icon: "receipt" },
      { href: "/admin/me", label: "My profile", icon: "users" },
    ],
  },
  {
    id: "store", label: "Store", perm: [P.CATALOGUE_MANAGE, P.STOCK_MANAGE, P.FULFILMENT_MANAGE],
    items: [
      { href: "/admin/store", label: "Overview", icon: "chart", perm: P.CATALOGUE_MANAGE },
      { href: "/admin/store/packing", label: "Orders to pack", icon: "list", badge: "pack", perm: P.FULFILMENT_MANAGE },
      { href: "/admin/store/pickup", label: "Pick-up desk", icon: "qr", perm: P.FULFILMENT_MANAGE },
      { href: "/admin/store/returns", label: "Returns", icon: "refresh", perm: P.FULFILMENT_MANAGE },
      { href: "/admin/store/items", label: "Items", icon: "tag", perm: P.CATALOGUE_MANAGE },
      { href: "/admin/store/piles", label: "Core-textbook piles", icon: "layers", perm: P.CATALOGUE_MANAGE },
      { href: "/admin/store/categories", label: "Categories", icon: "layers", perm: P.CATALOGUE_MANAGE },
      { href: "/admin/store/stock", label: "Stock", icon: "box", perm: P.STOCK_MANAGE },
    ],
  },
  {
    id: "payments", label: "Payments", perm: [P.PAYMENTS_REVIEW, P.INVOICES_MANAGE, P.WALLETS_ADJUST],
    items: [
      { href: "/admin/accounts", label: "Overview", icon: "chart", perm: P.PAYMENTS_REVIEW },
      { href: "/admin/accounts/review", label: "Payments to review", icon: "receipt", badge: "review", perm: P.PAYMENTS_REVIEW },
      { href: "/admin/accounts/returns", label: "Returns to approve", icon: "refresh", badge: "returns", perm: P.PAYMENTS_REVIEW },
      { href: "/admin/accounts/invoices", label: "Invoices", icon: "file", perm: P.INVOICES_MANAGE },
      { href: "/admin/accounts/wallets", label: "Parent wallets", icon: "wallet", perm: P.WALLETS_ADJUST },
    ],
  },
  {
    id: "pupils", label: "Pupils", perm: P.PUPILS_MANAGE,
    items: [
      { href: "/admin/office/pupils", label: "Pupils", icon: "users" },
      { href: "/admin/office/pupils/new", label: "Add pupil", icon: "plus" },
      { href: "/admin/office/import", label: "Bulk import", icon: "upload" },
      { href: "/admin/office/bin", label: "Recently deleted", icon: "trash", badge: "bin" },
    ],
  },
  {
    id: "admissions", label: "Admissions", perm: P.ADMISSIONS_VIEW,
    items: [
      { href: "/admin/admissions", label: "Applications", icon: "file", badge: "apps" },
      { href: "/admin/admissions/new", label: "Register a child", icon: "plus", perm: P.ADMISSIONS_MANAGE },
      { href: "/admin/admissions/admitted", label: "Admitted pupils", icon: "users" },
      { href: "/admin/admissions/windows", label: "Windows & exams", icon: "clock" },
    ],
  },
  {
    id: "website", label: "Website", perm: P.WEBSITE_MANAGE,
    items: [
      { href: "/admin/website", label: "Messages", icon: "mail", badge: "enq" },
      { href: "/admin/website/notices", label: "Notices", icon: "bell" },
      { href: "/admin/website/events", label: "Events", icon: "clock" },
      { href: "/admin/website/news", label: "News", icon: "file" },
      { href: "/admin/website/gallery", label: "Gallery", icon: "layers" },
    ],
  },
  {
    id: "staff", label: "Staff", perm: P.HR_VIEW_SECTION,
    items: [
      { href: "/admin/hr", label: "Staff records", icon: "users" },
      { href: "/admin/hr/new", label: "Register staff", icon: "plus", perm: P.HR_MANAGE },
      { href: "/admin/hr/reviews", label: "To review", icon: "check", badge: "hr" },
    ],
  },
  {
    id: "attendance", label: "Attendance", perm: P.ATTENDANCE_VIEW_SECTION,
    items: [
      { href: "/admin/attendance", label: "Today", icon: "clock" },
      { href: "/admin/attendance/month", label: "Month", icon: "list" },
      { href: "/admin/attendance/leave", label: "Leave requests", icon: "file", badge: "leave" },
      { href: "/admin/attendance/blocked", label: "Blocked clock-ins", icon: "alert", badge: "blocked", perm: P.SETTINGS_MANAGE },
    ],
  },
  {
    id: "payroll", label: "Payroll", perm: P.PAYROLL_VIEW,
    items: [
      { href: "/admin/payroll", label: "Payroll runs", icon: "wallet", badge: "payroll" },
      { href: "/admin/payroll/penalties", label: "Penalties & bonuses", icon: "alert" },
    ],
  },
  {
    id: "settings", label: "Settings", perm: [P.SETTINGS_MANAGE, P.ATTENDANCE_MANAGE, P.PAYROLL_VIEW],
    items: SETTINGS_TABS,
  },
  {
    id: "system", label: "System", perm: [P.SETTINGS_MANAGE, P.STAFF_MANAGE, P.AUDIT_VIEW, P.BACKUP_MANAGE],
    items: [
      { href: "/admin/overview", label: "School overview", icon: "chart", perm: P.REPORTS_VIEW },
      { href: "/admin/staff", label: "Staff & roles", icon: "shield", perm: P.STAFF_MANAGE },
      { href: "/admin/people", label: "View as parent / pupil", icon: "eye", perm: P.VIEW_AS },
      { href: "/admin/sessions", label: "Sessions", icon: "clock", perm: P.SESSIONS_MANAGE },
      { href: "/admin/backup", label: "Backups & restores", icon: "db", perm: P.BACKUP_MANAGE },
      { href: "/admin/audit", label: "Audit log", icon: "list", perm: P.AUDIT_VIEW },
    ],
  },
  {
    id: "alpha", label: "Alpha", perm: P.ALPHA,
    items: [
      { href: "/admin/alpha", label: "System health", icon: "shield" },
      { href: "/admin/alpha/data", label: "Data explorer", icon: "db" },
      { href: "/admin/alpha/sql", label: "SQL console", icon: "file" },
      { href: "/admin/alpha/start-fresh", label: "Start fresh", icon: "refresh" },
    ],
  },
];

const allowed = (perms: ReadonlySet<string>, p?: Permission | Permission[]) => !p || (Array.isArray(p) ? p.some((x) => perms.has(x)) : perms.has(p));

/** The menu for one person: areas they can open, each with only the links they can open */
export function navFor(perms: ReadonlySet<string>): NavSection[] {
  return STAFF_SECTIONS.filter((s) => allowed(perms, s.perm))
    .map((s) => ({ ...s, items: s.items.filter((i) => allowed(perms, i.perm)) }))
    .filter((s) => s.items.length > 0);
}

/** Can this person open this link? (Used by search and the task list so they never point somewhere forbidden.) */
export const canOpen = (perms: ReadonlySet<string>, p?: Permission | Permission[]) => allowed(perms, p);
