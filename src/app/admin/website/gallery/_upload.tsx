"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/shared/lib/action";
import { useToast } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

const MAX_SIDE = 1600;

/** Redraw the photo at most 1600px wide/high as a JPEG: phone photos shrink from ~4 MB to ~300 KB, and location data is dropped. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read photo"))), "image/jpeg", 0.85));
}

export function PhotoUploader({ action, albums }: { action: Action; albums: string[] }) {
  const [album, setAlbum] = useState(albums[0] ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<{ done: number; failed: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const router = useRouter();
  const busy = progress !== null && progress.done + progress.failed < files.length;

  async function upload() {
    if (!album.trim()) return toast("Enter an album name first.", false);
    if (!files.length) return toast("Choose some photos first.", false);
    let done = 0, failed = 0;
    setProgress({ done, failed });
    for (const f of files) {
      try {
        const blob = await shrink(f);
        const fd = new FormData();
        fd.set("album", album.trim());
        fd.set("file", new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
        const r = await action({ ok: false }, fd);
        if (r.ok) done++; else { failed++; if (r.message) toast(`${f.name}: ${r.message}`, false); }
      } catch {
        failed++;
        toast(`${f.name} couldn't be read. Try a JPG or PNG photo.`, false);
      }
      setProgress({ done, failed });
    }
    toast(`${done} photo${done === 1 ? "" : "s"} added to ${album.trim()}.`, failed === 0);
    setFiles([]);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="card stack">
      <h3>Add photos</h3>
      <div className="grid g2">
        <div className="field">
          <label htmlFor="up-album">Album</label>
          <input className="input" id="up-album" list="album-names" value={album} onChange={(e) => setAlbum(e.target.value)} placeholder="e.g. Inter-house sports 2026" maxLength={80} />
          <datalist id="album-names">{albums.map((a) => <option key={a} value={a} />)}</datalist>
          <span className="hint">Pick an existing album or type a new name.</span>
        </div>
        <div className="field">
          <label htmlFor="up-files">Photos</label>
          <input ref={input} className="input" id="up-files" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => { setFiles([...(e.target.files ?? [])]); setProgress(null); }} />
          <span className="hint">Choose as many as you like. They are resized before uploading.</span>
        </div>
      </div>
      <div className="row">
        <button type="button" className="btn primary" onClick={upload} disabled={busy || !files.length}>
          {busy ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Icon name="upload" size="sm" />}
          {busy ? `Uploading ${progress!.done + progress!.failed + 1} of ${files.length}…` : `Upload ${files.length || ""} photo${files.length === 1 ? "" : "s"}`}
        </button>
        {progress && !busy && <span className="small muted">{progress.done} added{progress.failed ? `, ${progress.failed} failed` : ""}</span>}
      </div>
    </div>
  );
}
