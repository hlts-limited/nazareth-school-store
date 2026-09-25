import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import type { CategoryNode, ItemFull } from "@/modules/catalogue";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/** Shared add / edit item form (server-rendered; submits to a server action) */
export function ItemForm({ action, cats, classes, item }: { action: Action; cats: CategoryNode[]; classes: { id: string; name: string }[]; item?: ItemFull }) {
  const chosen = new Set(item?.classes.map((c) => c.classId) ?? []);
  const compulsory = item?.classes.some((c) => c.isCompulsory) ?? false;
  return (
    <ActionForm action={action} className="card stack" id="item-form">
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="grid g2">
        <div className="field"><label htmlFor="ai-n">Item name</label><input className="input" id="ai-n" name="name" defaultValue={item?.name} placeholder="e.g. Cursive Writing Book 3" /><FieldError name="name" /></div>
        <div className="field"><label htmlFor="ai-c">Category</label>
          <select className="input" id="ai-c" name="categoryId" defaultValue={item?.categoryId ?? ""}>
            <option value="" disabled>Choose a category</option>
            {cats.map((c) => (
              <optgroup key={c.id} label={c.name}>
                <option value={c.id}>{c.name}</option>
                {c.children.map((s) => <option key={s.id} value={s.id}>{c.name} › {s.name}</option>)}
              </optgroup>
            ))}
          </select><FieldError name="categoryId" /></div>
      </div>
      <div className="field"><label htmlFor="ai-d">Description (optional)</label><input className="input" id="ai-d" name="description" defaultValue={item?.description ?? ""} /></div>
      <div className="field">
        <span className="lbl">Classes it&apos;s for</span>
        <div className="row tight">
          {classes.map((c) => <label key={c.id} className="chip"><input type="checkbox" name="classIds" value={c.id} defaultChecked={chosen.has(c.id)} style={{ accentColor: "var(--red)" }} /> {c.name}</label>)}
        </div>
        <FieldError name="classIds" />
      </div>
      <label className="check"><input type="checkbox" name="compulsory" defaultChecked={compulsory} /> Required on the booklist for these classes</label>
      <div className="grid g3">
        <div className="field"><label htmlFor="ai-p">Price (₦)</label><input className="input tnum" id="ai-p" name="price" inputMode="numeric" defaultValue={item?.price} /><FieldError name="price" /></div>
        {!item && <div className="field"><label htmlFor="ai-s">Opening stock (per size)</label><input className="input tnum" id="ai-s" name="openingStock" inputMode="numeric" defaultValue={0} /></div>}
        <div className="field"><label htmlFor="ai-r">Reorder level</label><input className="input tnum" id="ai-r" name="reorderLevel" inputMode="numeric" defaultValue={item?.reorderLevel ?? 5} /><span className="hint">Shows a low-stock alert at or below this.</span></div>
      </div>
      <div className="field">
        <label htmlFor="ai-v">{item ? "Add sizes (comma separated)" : "Sizes (optional, comma separated)"}</label>
        <input className="input" id="ai-v" name="variants" placeholder="Age 5–6, Age 7–8, Age 9–10" />
        {item?.hasVariants && <span className="hint">Current sizes: {item.variants.map((v) => v.label).join(", ")}</span>}
      </div>
      <div className="field"><label htmlFor="ai-img">Product photo (JPG, PNG or WebP, up to 5 MB)</label><input className="input" id="ai-img" name="image" type="file" accept="image/jpeg,image/png,image/webp" /><FieldError name="image" /></div>
      {item && <label className="check"><input type="checkbox" name="isActive" defaultChecked={item.isActive} /> Show in the store</label>}
      <div className="row"><SubmitButton>{item ? "Save item" : "Add item"}</SubmitButton></div>
    </ActionForm>
  );
}
