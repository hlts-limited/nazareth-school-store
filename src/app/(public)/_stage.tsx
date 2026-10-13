import { Checklist } from "./_parts";
import { STAGES } from "./_content";

/** One curriculum stage card: name, classes, summary and learning areas */
export function StageCard({ id }: { id: string }) {
  const s = STAGES.find((x) => x.id === id);
  if (!s) return null;
  return (
    <article className="card stack" id={s.id}>
      <div className="stack tight">
        <h3>{s.name}</h3>
        <div className="row tight">{s.classes.map((c) => <span key={c} className="pill plain">{c}</span>)}</div>
      </div>
      <p className="muted">{s.text}</p>
      <div className="stack tight">
        <span className="eyebrow">Learning areas</span>
        <Checklist items={s.areas} />
      </div>
    </article>
  );
}
