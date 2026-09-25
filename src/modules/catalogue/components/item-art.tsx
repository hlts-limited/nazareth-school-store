/* eslint-disable @next/next/no-img-element */
/**
 * Product picture: the uploaded photo when there is one, otherwise a clean drawn placeholder
 * in the category colour (so the store never shows broken images).
 */
export function ItemArt({ imageKey, name, color, kind, size = "card" }: { imageKey?: string | null; name: string; color: string; kind?: string; size?: "card" | "thumb" }) {
  const box = size === "card" ? "pimg" : "th";
  const style = { background: `color-mix(in srgb, ${color} 10%, var(--surface))` };
  if (imageKey) {
    return (
      <span className={box} style={style}>
        <img src={`/api/files/${imageKey}`} alt={name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </span>
    );
  }
  const label = name.split(" ")[0].slice(0, 9).toUpperCase();
  const k = kind ?? "book";
  const shapes: Record<string, string> = {
    book: `<rect x="18" y="8" width="64" height="84" rx="4" fill="${color}"/><rect x="18" y="8" width="9" height="84" fill="#000" opacity=".18"/><rect x="34" y="22" width="40" height="22" rx="3" fill="#fff" opacity=".95"/><text x="54" y="37" text-anchor="middle" font-family="Arial" font-size="9" font-weight="800" fill="${color}">${label.replace(/[<&>"]/g, "")}</text><path d="M44 58h20M44 64h14" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>`,
    uniform: `<path d="M34 12l-20 12 8 16 8-4v52h40V36l8 4 8-16-20-12c-3 7-9 10-16 10s-13-3-16-10z" fill="#fff" stroke="${color}" stroke-width="3"/><circle cx="62" cy="44" r="6" fill="#D7262D"/>`,
    shoe: `<path d="M10 58c0-10 6-18 14-20l18-4c6 8 16 12 28 12h10c6 0 10 5 10 11v7H10z" fill="#231F20"/><rect x="8" y="64" width="84" height="10" rx="4" fill="#4A4446"/>`,
    bag: `<rect x="22" y="24" width="56" height="66" rx="12" fill="${color}"/><path d="M36 24v-6a14 14 0 0 1 28 0v6" fill="none" stroke="${color}" stroke-width="5"/><rect x="32" y="54" width="36" height="24" rx="6" fill="#fff" opacity=".25"/>`,
    stationery: `<rect x="20" y="18" width="12" height="64" rx="2" fill="#F2B705"/><path d="M20 82l6 12 6-12z" fill="#E9C9A0"/><rect x="40" y="18" width="12" height="64" rx="2" fill="#D7262D"/><path d="M40 82l6 12 6-12z" fill="#E9C9A0"/><rect x="60" y="30" width="22" height="56" rx="2" fill="#fff" stroke="${color}" stroke-width="2.5"/>`,
    other: `<rect x="18" y="30" width="64" height="54" rx="10" fill="${color}"/><path d="M38 30v-8h24v8" fill="none" stroke="${color}" stroke-width="5"/>`,
  };
  return (
    <span className={box} style={style}>
      <svg viewBox="0 0 100 100" aria-hidden="true" dangerouslySetInnerHTML={{ __html: shapes[k] ?? shapes.other }} />
    </span>
  );
}

/** Map a root category slug to a placeholder drawing */
export function artKind(rootSlug?: string | null) {
  if (!rootSlug) return "other";
  if (rootSlug.startsWith("book")) return "book";
  if (rootSlug.startsWith("uniform") || rootSlug.startsWith("sport")) return "uniform";
  if (rootSlug.startsWith("shoe")) return "shoe";
  if (rootSlug.startsWith("bag")) return "bag";
  if (rootSlug.startsWith("stationer")) return "stationery";
  return "other";
}
