import Link from "next/link";
import { fmtDateTime } from "@/shared/lib/format";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { Empty, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { listEnquiries, setEnquiryHandledAction } from "@/modules/website";

export const metadata = { title: "Website messages" };

const wa = (phone: string, name: string) => `https://wa.me/234${phone.slice(1)}?text=${encodeURIComponent(`Hello ${name.split(" ")[0]}, this is Nazareth School replying to your message.`)}`;

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireStaff("website.manage");
  const sp = await searchParams;
  const show = sp.show === "handled" || sp.show === "all" ? sp.show : "open";
  const rows = await listEnquiries(show);
  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title="Website messages" sub="Messages sent from the Contact page. Reply by email, phone or WhatsApp, then mark them handled." />
      <div className="stack">
        <div className="chips">
          {([["open", "To answer"], ["handled", "Handled"], ["all", "All"]] as const).map(([k, l]) => (
            <Link key={k} className={`chip ${show === k ? "on" : ""}`} href={k === "open" ? "/admin/website" : `/admin/website?show=${k}`}>{l}</Link>
          ))}
        </div>
        {rows.length === 0 ? (
          <div className="card"><Empty title={show === "open" ? "No messages to answer" : "No messages"}>New messages from the website&apos;s Contact page appear here.</Empty></div>
        ) : rows.map((m) => (
          <article key={m.id} className={`card stack ${m.handledAt ? "muted-card" : ""}`}>
            <div className="row between">
              <div className="stack tight">
                <h3>{m.subject}</h3>
                <span className="small muted">{m.name} · {fmtDateTime(m.createdAt)}</span>
              </div>
              {m.handledAt ? <span className="pill ok">Handled</span> : <span className="pill info">New</span>}
            </div>
            <p className="msg-body">{m.message}</p>
            <div className="row between">
              <div className="row tight">
                {m.email && <a className="btn sm" href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}><Icon name="mail" size="sm" />{m.email}</a>}
                {m.phone && <a className="btn sm" href={`tel:${m.phone}`}><Icon name="phone" size="sm" />{m.phone}</a>}
                {m.phone && <a className="btn sm wa" href={wa(m.phone, m.name)} target="_blank" rel="noopener noreferrer"><Icon name="chat" size="sm" />WhatsApp</a>}
              </div>
              <ActionForm action={setEnquiryHandledAction}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="handled" value={m.handledAt ? "0" : "1"} />
                <SubmitButton size="sm" variant={m.handledAt ? "ghost" : "success"} icon={m.handledAt ? "restore" : "check"}>{m.handledAt ? "Reopen" : "Mark handled"}</SubmitButton>
              </ActionForm>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
