import Link from "next/link";
import { Empty, LinkButton, PageHeader } from "@/shared/ui/primitives";
import { Icon } from "@/shared/ui/icon";
import { requireStaff } from "@/modules/auth";
import { listClasses } from "@/modules/catalogue";
import { admissionStatus, ApplicationFields, listWindows, registerApplicationAction } from "@/modules/admissions";

export const metadata = { title: "Register a child" };

export default async function RegisterChildPage() {
  const v = await requireStaff("admissions.manage");
  const [windows, classes, current] = await Promise.all([listWindows(), listClasses(), admissionStatus()]);
  if (!windows.length) {
    return (
      <>
        <PageHeader title="Register a child" />
        <div className="card"><Empty title="No admission session yet" action={v.permissions.has("admissions.publish") ? <LinkButton href="/admin/admissions/windows" variant="primary" icon="plus">Set up an admission window</LinkButton> : undefined}>Create an admission window first.</Empty></div>
      </>
    );
  }
  // The open (or next) session first
  const first = current.window?.id;
  const ordered = [...windows].sort((a, b) => (a.id === first ? -1 : b.id === first ? 1 : 0)).map((w) => ({ id: w.id, session: w.session, formFee: w.formFee }));
  return (
    <div className="form-wrap" style={{ maxWidth: 920 }}>
      <PageHeader title="Register a child" sub="For families who apply at the school office. The class is chosen by age; you can choose another class if needed."
        actions={<Link className="btn" href="/admin/admissions"><Icon name="back" size="sm" />Applications</Link>} />
      <ApplicationFields action={registerApplicationAction} mode="office" windows={ordered} classes={classes.map((c) => ({ id: c.id, name: c.name }))} submitLabel="Register child" cancelHref="/admin/admissions" />
    </div>
  );
}
