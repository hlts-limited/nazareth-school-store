"use server";

import { z } from "zod";
import { fail, ok, parseForm, runAction, zInt, zText, type ActionResult } from "@/shared/lib/action";
import { auditActor, staffFor } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { getSettings, saveSetting } from "@/modules/settings";

export async function saveSchoolSettingsAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("settings.manage");
    const d = parseForm(z.object({
      accountName: zText(100, "Enter the account name"), bankName: zText(60, "Enter the bank"),
      accountNumber: z.string().trim().regex(/^\d{10}$/, "Account numbers have 10 digits"),
      autoCancelHours: z.coerce.number().int().refine((n) => [24, 48, 72, 96].includes(n), "Choose a value"),
      feeBearer: z.enum(["school", "parent"]), currentTerm: zText(60, "Enter the current term"),
    }), form);
    await saveSetting("bank", { accountName: d.accountName, bankName: d.bankName, accountNumber: d.accountNumber });
    await saveSetting("autoCancelHours", d.autoCancelHours);
    await saveSetting("feeBearer", d.feeBearer);
    await saveSetting("currentTerm", d.currentTerm);
    await audit(await auditActor(v), "Updated settings", "Setting", null, d);
    return ok("Settings saved.");
  });
}

export async function saveSessionLimitsAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("sessions.manage");
    const s = await getSettings();
    const n = (k: string, min: number, max: number) => {
      const r = zInt(min).safeParse(form.get(k));
      if (!r.success || r.data > max) throw new Error(`bad:${k}`);
      return r.data;
    };
    try {
      const L = structuredClone(s.sessionLimits);
      for (const k of ["PARENT", "PUPIL", "STAFF", "ADMIN"] as const) {
        L[k].idleMinutes = n(`${k}.idle`, 5, 24 * 60);
        L[k].maxHours = n(`${k}.max`, 1, 24 * 30);
        L[k].devices = n(`${k}.devices`, 1, 10);
      }
      await saveSetting("sessionLimits", L);
      await audit(await auditActor(v), "Changed session limits", "Setting", "sessionLimits", L);
      return ok("Session limits saved. They apply from each person's next page load.");
    } catch (e) {
      if (String((e as Error).message).startsWith("bad:")) return fail("Idle 5–1440 minutes, max 1–720 hours, devices 1–10.");
      throw e;
    }
  });
}
