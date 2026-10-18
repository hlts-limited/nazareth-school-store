"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, FieldError } from "@/shared/ui/client";
import { shrinkImage } from "@/shared/ui/shrink-image";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/** Shrinks a chosen photo in the browser (phone photos are often over the 4 MB limit) before the form is sent */
async function shrinkPhoto(data: FormData): Promise<FormData | string> {
  const f = data.get("photo");
  if (!(f instanceof File) || f.size === 0) { data.delete("photo"); return data; }
  try { data.set("photo", await shrinkImage(f)); } catch { return "That photo couldn't be read. Try a JPG or PNG photo."; }
  return data;
}

export function EventForm({ action, resetOnSuccess, children }: { action: Action; resetOnSuccess?: boolean; children: ReactNode }) {
  return <ActionForm action={action} className="stack" resetOnSuccess={resetOnSuccess} prepare={shrinkPhoto}>{children}</ActionForm>;
}

/** Photo picker with a preview. An existing photo can be replaced, or removed with the tick box. */
export function EventPhotoField({ id, current }: { id: string; current?: string | null }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  // After "Add event" saves, the form is cleared: clear the preview with it
  useEffect(() => {
    const form = input.current?.form;
    const clear = () => { setPreview(null); setRemove(false); };
    form?.addEventListener("reset", clear);
    return () => form?.removeEventListener("reset", clear);
  }, []);
  const shown = preview ?? (current && !remove ? current : null);

  return (
    <div className="field">
      <label htmlFor={`ep-${id}`}>Photo (optional)</label>
      <div className="ev-photo-field">
        {shown
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={shown} alt="" className="ev-photo-prev" />
          : <span className="ev-photo-prev empty">No photo</span>}
        <div className="stack tight">
          <input ref={input} className="input" id={`ep-${id}`} name="photo" type="file" accept="image/jpeg,image/png,image/webp"
            onChange={(e) => { const f = e.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : null); if (f) setRemove(false); }} />
          <span className="hint">Shown on the event card on the website. Phone photos are resized before uploading.</span>
          {current && !preview && (
            <label className="check"><input type="checkbox" name="removePhoto" checked={remove} onChange={(e) => setRemove(e.target.checked)} /> Remove the current photo</label>
          )}
        </div>
      </div>
      <FieldError name="photo" />
    </div>
  );
}
