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
  /** Enter penalties and waivers */
  PAYROLL_PENALTIES: "payroll.penalties",
  /** Approve a run (never one you prepared) */
  PAYROLL_APPROVE: "payroll.approve",
  /** Press Pay (the Proprietor only) */
  PAYROLL_PAY: "payroll.pay",
  /** Alpha Admin only: raw data editing, SQL console. Never part of a role; see ALPHA_ADMIN_EMAIL. */
  ALPHA: "system.alpha",
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
    permissions: [P.PUPILS_VIEW, P.PUPILS_MANAGE, P.PUPILS_DELETE, P.ADMISSIONS_VIEW, P.ADMISSIONS_MANAGE, P.ADMISSIONS_PUBLISH, P.WEBSITE_MANAGE],
  },
  {
    id: "proprietor", name: "Proprietor", requires2fa: true,
    permissions: [P.SELF_SERVICE, P.HR_VIEW_SECTION, P.HR_VIEW, P.HR_MANAGE, P.HR_SALARY, P.ATTENDANCE_VIEW_SECTION, P.ATTENDANCE_MANAGE, P.ATTENDANCE_PHOTOS, P.PAYROLL_VIEW, P.PAYROLL_PENALTIES, P.PAYROLL_APPROVE, P.PAYROLL_PAY],
  },
  {
    id: "bursar", name: "Bursar", requires2fa: true,
    permissions: [P.SELF_SERVICE, P.HR_VIEW_SECTION, P.HR_VIEW, P.HR_SALARY, P.HR_BANK_APPROVE, P.ATTENDANCE_VIEW_SECTION, P.PAYROLL_VIEW, P.PAYROLL_RUN],
  },
  {
    id: "hr", name: "Admin / HR", requires2fa: true,
    permissions: [P.SELF_SERVICE, P.HR_VIEW_SECTION, P.HR_VIEW, P.HR_MANAGE, P.HR_SALARY, P.ATTENDANCE_VIEW_SECTION, P.ATTENDANCE_MANAGE, P.ATTENDANCE_PHOTOS, P.PAYROLL_VIEW, P.PAYROLL_PENALTIES],
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
    // Everything except Alpha; approving and paying salaries stays with the Proprietor
    permissions: (Object.values(P) as Permission[]).filter((p) => p !== P.ALPHA && p !== P.PAYROLL_APPROVE && p !== P.PAYROLL_PAY),
  },
];

/** The Alpha Admin is the single account named by ALPHA_ADMIN_EMAIL. It has every permission, can't be given out
 *  from Staff & roles, and is shown with this pseudo-role id. */
export const ALPHA_ROLE = "alpha";
export const ALL_PERMISSIONS = Object.values(P) as Permission[];

export const roleName = (id: string) => (id === ALPHA_ROLE ? "Alpha Admin" : ROLE_DEFS.find((r) => r.id === id)?.name ?? id);

/** Staff areas shown in the back office; a person sees the areas their permissions allow. */
export const STAFF_SECTIONS: { id: string; label: string; perm: Permission; items: { href: string; label: string; icon: string; badge?: "review" | "pack" | "bin" | "apps" | "enq" | "hr" | "leave" }[] }[] = [
  {
    id: "alpha", label: "Alpha", perm: P.ALPHA,
    items: [
      { href: "/admin/alpha", label: "System overview", icon: "shield" },
      { href: "/admin/alpha/data", label: "Data explorer", icon: "db" },
      { href: "/admin/alpha/sql", label: "SQL console", icon: "file" },
      { href: "/admin/alpha/backups", label: "Backups & restores", icon: "layers" },
      { href: "/admin/alpha/start-fresh", label: "Start fresh", icon: "refresh" },
      { href: "/admin/alpha/audit", label: "Full audit log", icon: "list" },
    ],
  },
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
      { href: "/admin/store/piles", label: "Core-textbook piles", icon: "layers" },
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
  {
    id: "admissions", label: "Admissions", perm: P.ADMISSIONS_VIEW,
    items: [
      { href: "/admin/admissions", label: "Applications", icon: "file", badge: "apps" },
      { href: "/admin/admissions/new", label: "Register a child", icon: "plus" },
      { href: "/admin/admissions/admitted", label: "Admitted pupils", icon: "users" },
      { href: "/admin/admissions/windows", label: "Windows & exams", icon: "clock" },
    ],
  },
  {
    id: "hr", label: "Staff records", perm: P.HR_VIEW_SECTION,
    items: [
      { href: "/admin/hr", label: "Staff", icon: "users" },
      { href: "/admin/hr/new", label: "Register staff", icon: "plus" },
      { href: "/admin/hr/reviews", label: "To review", icon: "check", badge: "hr" },
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
    id: "attendance", label: "Attendance", perm: P.ATTENDANCE_VIEW_SECTION,
    items: [
      { href: "/admin/attendance", label: "Today", icon: "clock" },
      { href: "/admin/attendance/month", label: "Month", icon: "list" },
      { href: "/admin/attendance/leave", label: "Leave requests", icon: "file", badge: "leave" },
      { href: "/admin/attendance/settings", label: "Settings & holidays", icon: "cog" },
    ],
  },
  {
    id: "payroll", label: "Payroll", perm: P.PAYROLL_VIEW,
    items: [
      { href: "/admin/payroll", label: "Payroll runs", icon: "wallet" },
      { href: "/admin/payroll/penalties", label: "Penalties & waivers", icon: "alert" },
      { href: "/admin/payroll/settings", label: "Rates & tax bands", icon: "cog" },
    ],
  },
  {
    id: "me", label: "My staff page", perm: P.SELF_SERVICE,
    items: [
      { href: "/admin/me/clock", label: "Clock in / out", icon: "qr" },
      { href: "/admin/me/attendance", label: "My attendance & leave", icon: "clock" },
      { href: "/admin/me/payslips", label: "My payslips", icon: "receipt" },
      { href: "/admin/me", label: "My profile", icon: "users" },
    ],
  },
];
