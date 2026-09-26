import { notFound, redirect } from "next/navigation";
import { Note, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { categoryTree, getItem, listClasses, updateItemAction } from "@/modules/catalogue";
import { ItemForm } from "../item-form";

export const metadata = { title: "Edit item" };

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("catalogue.manage");
  const { id } = await params;
  const [item, cats, classes] = await Promise.all([getItem(id), categoryTree(), listClasses()]);
  if (!item) notFound();
  if (item.isPile) redirect(`/admin/store/piles/${item.id}`);
  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader title={item.name} sub={`SKU ${item.sku}`} />
      {item.inPiles[0] && <div style={{ marginBottom: 12 }}><Note icon="layers">This book is only sold to parents as part of <b>{item.inPiles[0].pile.name}</b>. Changing its price changes the pile&apos;s price too.</Note></div>}
      <ItemForm action={updateItemAction} cats={cats} classes={classes} item={item} />
    </div>
  );
}
