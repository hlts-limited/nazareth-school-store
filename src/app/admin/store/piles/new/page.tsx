import { PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { categoryTree, listClasses, pileBookChoices, savePileAction, variantAvailable } from "@/modules/catalogue";
import { PileForm } from "../pile-form";

export const metadata = { title: "New pile" };

export default async function NewPilePage() {
  await requireStaff("catalogue.manage");
  const [cats, classes, books] = await Promise.all([categoryTree(), listClasses(), pileBookChoices()]);
  return (
    <div style={{ maxWidth: 960 }}>
      <PageHeader title="New core-textbook pile" sub="Group compulsory books that parents must buy together." />
      <PileForm action={savePileAction} cats={cats} classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        books={books.map((b) => ({ id: b.id, name: b.name, sku: b.sku, price: b.price, available: b.variants[0] ? variantAvailable(b.variants[0]) : 0, otherPile: b.inPiles[0]?.pile.name ?? null }))} />
    </div>
  );
}
