import Link from "next/link";
import { fmtDate } from "@/shared/lib/format";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Empty, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { deleteNewsAction, listNews, saveNewsAction } from "@/modules/website";
import { EventForm as PhotoForm, EventPhotoField as PhotoField } from "../events/_form";

export const metadata = { title: "News" };

type N = Awaited<ReturnType<typeof listNews>>[number];

/** yyyy-mm-dd in Lagos time, for date inputs */
const localDay = (d?: Date | null) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(d) : "");

function NewsFields({ n }: { n?: N }) {
  const id = n?.id ?? "new";
  return (
    <>
      {n && <input type="hidden" name="id" value={n.id} />}
      <div className="field"><label htmlFor={`nt-${id}`}>Headline</label><input className="input" id={`nt-${id}`} name="title" defaultValue={n?.title} placeholder="Primary 6 pupils top the state maths quiz" maxLength={140} /><FieldError name="title" /></div>
      <div className="field"><label htmlFor={`ns-${id}`}>Short summary (optional)</label><input className="input" id={`ns-${id}`} name="summary" defaultValue={n?.summary ?? ""} placeholder="One or two lines shown in the list and on the homepage" maxLength={240} /></div>
      <div className="field">
        <label htmlFor={`nb-${id}`}>Story</label>
        <textarea className="input" id={`nb-${id}`} name="body" rows={8} defaultValue={n?.body} placeholder={"Write the story here.\n\nLeave an empty line between paragraphs."} />
        <FieldError name="body" />
      </div>
      <PhotoField id={`n-${id}`} current={n?.photoKey ? `/api/files/${n.photoKey}` : null} />
      <div className="grid g2">
        <div className="field"><label htmlFor={`nd-${id}`}>Date shown</label><input className="input" type="date" id={`nd-${id}`} name="publishedAt" defaultValue={localDay(n?.publishedAt ?? new Date())} /><span className="hint">A future date keeps the post hidden until that day.</span></div>
        <label className="check" style={{ alignSelf: "end" }}><input type="checkbox" name="published" defaultChecked={n ? n.published : true} /> Show on the website</label>
      </div>
    </>
  );
}

export default async function NewsAdminPage() {
  await requireStaff("website.manage");
  const posts = await listNews();
  const now = new Date();
  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title="News" sub="Results, awards, trips and other school news. The newest three show on the homepage." actions={<Link className="btn" href="/news" target="_blank">View on website</Link>} />
      <div className="stack loose">
        <details className="card stack" open={!posts.length}>
          <summary className="row between" style={{ cursor: "pointer" }}><h3>Write a news post</h3></summary>
          <PhotoForm action={saveNewsAction} resetOnSuccess>
            <NewsFields />
            <div><SubmitButton icon="plus">Publish</SubmitButton></div>
          </PhotoForm>
        </details>
        {posts.length === 0 ? <div className="card"><Empty title="No news yet">Share results, awards, visits and trips with parents.</Empty></div> : posts.map((n) => (
          <section key={n.id} className="card stack">
            <div className="row between">
              <div className="row nowrap" style={{ gap: 12, minWidth: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {n.photoKey && <img src={`/api/files/${n.photoKey}`} alt="" className="ev-thumb" loading="lazy" />}
                <div className="stack tight" style={{ minWidth: 0 }}>
                  <h3>{n.title}</h3>
                  <span className="small muted">{fmtDate(n.publishedAt)}{n.published && n.publishedAt <= now && <> · <Link href={`/news/${n.slug}`} target="_blank">Open</Link></>}</span>
                </div>
              </div>
              <div className="row tight">
                {!n.published ? <span className="pill plain">Draft</span> : n.publishedAt > now ? <span className="pill plain">Scheduled</span> : <span className="pill ok">Live</span>}
                <ActionForm action={deleteNewsAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <SubmitButton variant="ghost" size="sm" icon="trash" confirmText={`Delete "${n.title}"?`}>Delete</SubmitButton>
                </ActionForm>
              </div>
            </div>
            <details>
              <summary className="small" style={{ cursor: "pointer" }}>Edit</summary>
              <PhotoForm action={saveNewsAction}>
                <NewsFields n={n} />
                <div><SubmitButton variant="default">Save</SubmitButton></div>
              </PhotoForm>
            </details>
          </section>
        ))}
      </div>
    </div>
  );
}
