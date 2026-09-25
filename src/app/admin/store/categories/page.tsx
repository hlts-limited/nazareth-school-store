import { Card, PageHeader } from "@/shared/ui/primitives";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { requireStaff } from "@/modules/auth";
import { categoryTree, createCategoryAction } from "@/modules/catalogue";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  await requireStaff("catalogue.manage");
  const cats = await categoryTree();
  return (
    <>
      <PageHeader title="Categories" sub="Nested categories keep the store easy to browse. Books are grouped by class." />
      <div className="grid g2" style={{ alignItems: "start" }}>
        <Card>
          <div className="tree">
            {cats.map((c) => (
              <div key={c.id}>
                <div className="tree-node"><span className="chip" style={{ cursor: "default" }}><span className="dot" style={{ background: c.color }} />{c.name}</span><span className="ct small muted">{c.totalItems} items</span></div>
                {c.children.length > 0 && (
                  <div className="tree-children">
                    {c.children.map((s) => <div key={s.id} className="tree-node small"><Icon name="chev" size="sm" /><span>{s.name}</span><span className="ct muted">{s._count.items} items</span></div>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
        <ActionForm action={createCategoryAction} className="card stack" resetOnSuccess>
          <h3>Add a category</h3>
          <div className="field"><label htmlFor="ac-n">Name</label><input className="input" id="ac-n" name="name" placeholder="e.g. Cardigans" /></div>
          <div className="field"><label htmlFor="ac-p">Inside</label>
            <select className="input" id="ac-p" name="parentId" defaultValue=""><option value="">Top level</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="row"><SubmitButton icon="plus">Add category</SubmitButton></div>
        </ActionForm>
      </div>
    </>
  );
}
