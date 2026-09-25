import { notFound } from "next/navigation";
import { PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { categoryTree, getItem, listClasses, updateItemAction } from "@/modules/catalogue";
import { ItemForm } from "../item-form";

export const metadata = { title: "Edit item" };

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("catalogue.manage");
  const { id } = await params;
  const [item, cats, classes] = await Promise.all([getItem(id), categoryTree(), listClasses()]);
  if (!item) notFound();
  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader title={item.name} sub={`SKU ${item.sku}`} />
      <ItemForm action={updateItemAction} cats={cats} classes={classes} item={item} />
    </div>
  );
}
