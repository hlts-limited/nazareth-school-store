import { z } from "zod";

/** Result returned by every server action used with <ActionForm>. */
export type ActionResult = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  redirect?: string;
  data?: Record<string, unknown>;
};

export const initialResult: ActionResult = { ok: false };

/** A user-facing error: its message is safe to show. */
export class UserError extends Error {
  constructor(message: string, public fieldErrors?: Record<string, string>) {
    super(message);
  }
}

export function fail(message: string, fieldErrors?: Record<string, string>): ActionResult {
  return { ok: false, message, fieldErrors };
}
export function ok(message?: string, extra: Partial<ActionResult> = {}): ActionResult {
  return { ok: true, message, ...extra };
}

/** Parse FormData with a zod schema. Throws UserError with field messages when invalid. */
export function parseForm<T extends z.ZodTypeAny>(schema: T, form: FormData): z.infer<T> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (k in obj) {
      const prev = obj[k];
      obj[k] = Array.isArray(prev) ? [...prev, v] : [prev, v];
    } else obj[k] = v;
  }
  const r = schema.safeParse(obj);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of r.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    throw new UserError("Please check the highlighted fields.", fieldErrors);
  }
  return r.data;
}

/**
 * Wrap a server action body: turns UserError into a friendly result and hides unexpected errors.
 * Next.js redirect()/notFound() errors are re-thrown so they still work.
 */
export async function runAction(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserError) return fail(e.message, e.fieldErrors);
    const digest = (e as { digest?: string })?.digest;
    if (typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND") || digest.startsWith("NEXT_HTTP_ERROR"))) throw e;
    console.error("[action]", e);
    return fail("Something went wrong. Please try again, and contact the school office if it keeps happening.");
  }
}

// Small zod helpers for form values
export const zInt = (min = 0, msg = "Enter a whole number") =>
  z.preprocess((v) => (typeof v === "string" ? v.replace(/[,\s₦]/g, "") : v), z.coerce.number({ invalid_type_error: msg }).int(msg).min(min, `Must be at least ${min}`));
export const zText = (max = 200, msg = "Required") => z.string().trim().min(1, msg).max(max);
export const zOptText = (max = 500) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
export const zBool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
