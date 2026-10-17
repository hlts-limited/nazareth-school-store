import type { PayrollStatus } from "@prisma/client";
import { Pill } from "@/shared/ui/primitives";

export const RUN_STATUS: Record<PayrollStatus, [string, "ok" | "warn" | "err" | "info" | "plain"]> = {
  DRAFT: ["Stage 1: statutory", "plain"], STATUTORY_REVIEWED: ["Stage 2: tax", "info"], TAX_REVIEWED: ["Stage 3: penalties", "info"],
  DEFAULTS_REVIEWED: ["Ready for approval", "warn"], APPROVED: ["Approved: ready to pay", "warn"], PAID: ["Paid", "ok"], LOCKED: ["Locked", "plain"],
};

export const RunStatus = ({ s }: { s: PayrollStatus }) => <Pill tone={RUN_STATUS[s][1]}>{RUN_STATUS[s][0]}</Pill>;

/** ₦ from kobo, with kobo shown only when there are any */
export const money = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
