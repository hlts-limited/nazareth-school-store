import { ActionForm, SubmitButton } from "./client";
import type { ActionResult } from "@/shared/lib/action";

/** The Alpha Admin's delete button: asks to confirm, and says it can't be undone. Show it only to the Alpha. */
export function AlphaDelete({ action, field, id, what }: { action: (p: ActionResult, f: FormData) => Promise<ActionResult>; field: string; id: string; what: string }) {
  return (
    <ActionForm action={action} className="inline-form">
      <input type="hidden" name={field} value={id} />
      <SubmitButton size="sm" variant="danger" icon="trash" confirmText={`Delete ${what} for good? This can't be undone.`}>Delete</SubmitButton>
    </ActionForm>
  );
}
