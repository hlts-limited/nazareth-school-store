import { PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { categoryTree, createItemAction, listClasses } from "@/modules/catalogue";
import { ItemForm } from "../item-form";

export const metadata = { title: "Add item" };

export default async function NewItemPage() {
  await requireStaff("catalogue.manage");
  const [cats, classes] = await Promise.all([categoryTree(), listClasses()]);
  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader title="Add item" sub="Items appear in the store for the classes you choose." />
      <ItemForm action={createItemAction} cats={cats} classes={classes} />
    </div>
  );
}
