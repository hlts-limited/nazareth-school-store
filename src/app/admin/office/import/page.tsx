import { PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { listClasses } from "@/modules/catalogue";
import { commitImportAction, previewImportAction } from "@/modules/pupils";
import { ImportTool } from "../../_components";

export const metadata = { title: "Bulk import" };

const HEADER = "Surname,First name,Reg number,Class,Parent phone,Parent name";

const SAMPLE = `${HEADER}
Okoro,Chisom,NAZ/2026/201,Primary 1,08031112222,Ngozi Okoro
Adeleke,Tomiwa,NAZ/2026/202,Primary 1,08031113333,Kunle Adeleke
Udoh,Ekaette,NAZ/2026/203,Primary 7,08035556666,Grace Udoh`;

export default async function ImportPage() {
  await requireStaff("pupils.manage");
  const classes = (await listClasses()).map((c) => c.name);
  return (
    <>
      <PageHeader title="Bulk import" sub="Download the CSV template, fill it in Excel, then upload it (or paste rows). Rows are checked before anything is saved; new parents get an SMS invite." />
      <ImportTool preview={previewImportAction} commit={commitImportAction} sample={SAMPLE} header={HEADER} classes={classes} />
    </>
  );
}
