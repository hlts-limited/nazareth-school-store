import Link from "next/link";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Empty, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { deletePhotoAction, galleryAlbums, renameAlbumAction, updatePhotoAction, uploadPhotoAction } from "@/modules/website";
import { PhotoUploader } from "./_upload";

export const metadata = { title: "Gallery" };

export default async function GalleryAdminPage() {
  await requireStaff("website.manage");
  const albums = await galleryAlbums();
  return (
    <div style={{ maxWidth: 1080 }}>
      <PageHeader title="Gallery" sub="Albums appear on the website's Gallery page, newest album first." actions={<Link className="btn" href="/gallery" target="_blank">View on website</Link>} />
      <div className="stack loose">
        <PhotoUploader action={uploadPhotoAction} albums={albums.map((a) => a.name)} />
        {albums.length === 0 && <div className="card"><Empty title="No albums yet">Upload photos above. Until then the website shows the Cultural Day photos from the old site.</Empty></div>}
        {albums.map((a) => (
          <section key={a.name} className="card stack">
            <div className="row between">
              <h2>{a.name} <span className="muted small">· {a.photos.length} photo{a.photos.length === 1 ? "" : "s"}</span></h2>
              <details className="rename">
                <summary className="btn sm">Rename album</summary>
                <ActionForm action={renameAlbumAction} className="row tight">
                  <input type="hidden" name="from" value={a.name} />
                  <input className="input" name="to" defaultValue={a.name} aria-label="New album name" maxLength={80} />
                  <SubmitButton size="sm" variant="default">Save</SubmitButton>
                  <FieldError name="to" />
                </ActionForm>
              </details>
            </div>
            <div className="photo-admin">
              {a.photos.map((p) => (
                <figure key={p.id} className="photo-tile">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${p.thumbKey ?? p.fileKey}`} alt={p.caption ?? a.name} loading="lazy" />
                  <ActionForm action={updatePhotoAction} className="stack tight">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="album" value={a.name} />
                    <input className="input" name="caption" defaultValue={p.caption ?? ""} placeholder="Caption (optional)" aria-label="Caption" maxLength={160} />
                    <div className="row tight">
                      <SubmitButton size="sm" variant="default">Save</SubmitButton>
                    </div>
                  </ActionForm>
                  <ActionForm action={deletePhotoAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <SubmitButton size="sm" variant="ghost" icon="trash" confirmText="Delete this photo from the website?">Delete</SubmitButton>
                  </ActionForm>
                </figure>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
