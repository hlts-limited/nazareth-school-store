import { notFound } from "next/navigation";
import { PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { categoryTree, getItem, listClasses, pileBookChoices, savePileAction, variantAvailable } from "@/modules/catalogue";
import { PileForm } from "../pile-form";

export const metadata = { title: "Edit pile" };

export default async function EditPilePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("catalogue.manage");
  const { id } = await params;
  const [pile, cats, classes, books] = await Promise.all([getItem(id), categoryTree(), listClasses(), pileBookChoices()]);
  if (!pile?.isPile) notFound();
  return (
    <div style={{ maxWidth: 960 }}>
      <PageHeader title={`Edit ${pile.name}`} sub="Changes apply to new orders. Orders already placed keep the books they were placed with." />
      <PileForm action={savePileAction} cats={cats} classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        books={books.map((b) => ({ id: b.id, name: b.name, sku: b.sku, price: b.price, available: b.variants[0] ? variantAvailable(b.variants[0]) : 0, otherPile: b.inPiles.find((ip) => ip.pileId !== id)?.pile.name ?? null }))}
        pile={{ id: pile.id, name: pile.name, description: pile.description, categoryId: pile.categoryId, isActive: pile.isActive, classIds: pile.classes.map((c) => c.classId), compulsory: pile.classes.some((c) => c.isCompulsory), parts: pile.pileParts.map((pt) => ({ bookId: pt.bookId, qty: pt.qty })) }} />
    </div>
  );
}
