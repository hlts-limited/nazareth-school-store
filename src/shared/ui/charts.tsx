"use client";

/**
 * Overview charts in the "operations console" style: dark teal glass panels, glowing lines that a scanning band
 * draws in from left to right, markers that drop a line to a label underneath, numbers that roll up, a ruler
 * gauge with a red target, and live timers. Everything animates once, when it scrolls into view, and appears
 * already finished for anyone who has turned motion down. Plain SVG and CSS, no chart library.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export type Fmt = "naira" | "int" | "pct";
export type ChartMarker = { at: number; title: string; sub?: string; note?: string };

const LINE = ["#5EF2E6", "#38BDF8", "#A7F3D0", "#22D3EE", "#99F6E4", "#7DD3FC", "#2DD4BF", "#CFFAFE", "#67E8F9", "#5EEAD4", "#BAE6FD", "#14B8A6"];
const AMBER = "#FBBF24";

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;
const reduced = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function format(v: number, f: Fmt, compact = false) {
  if (f === "pct") return `${Math.round(v)}%`;
  if (f === "naira") {
    if (compact && Math.abs(v) >= 1000) {
      const [d, s] = Math.abs(v) >= 1_000_000 ? [1_000_000, "m"] : [1000, "k"];
      return `₦${(v / d).toFixed(v / d >= 10 ? 0 : 1).replace(/\.0$/, "")}${s}`;
    }
    return `₦${Math.round(v).toLocaleString("en-NG")}`;
  }
  return compact && v >= 10000 ? `${(v / 1000).toFixed(0)}k` : Math.round(v).toLocaleString("en-NG");
}

/** Calls back once with true when the element first scrolls into view */
function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

/** 0 → 1 over `ms` once `go` is true (instantly when motion is turned down) */
function useProgress(go: boolean, ms: number, delay = 0) {
  const [p, setP] = useState(0);
  useIso(() => { if (reduced()) setP(1); }, []);
  useEffect(() => {
    if (!go || reduced()) return;
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (t: number) => {
      const x = Math.min(1, Math.max(0, (t - start) / ms));
      setP(x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [go, ms, delay]);
  return p;
}

// ---------- Rolling numbers ----------

/** A number that rolls up from zero when it comes into view */
export function Roll({ value, format: f = "int", ms = 1400 }: { value: number; format?: Fmt; ms?: number }) {
  const [ref, seen] = useSeen<HTMLSpanElement>();
  const p = useProgress(seen, ms);
  return <span ref={ref} className="tnum" aria-label={format(value, f)}>{format(value * p, f)}</span>;
}

// ---------- Glass panel ----------

export function Glass({ title, right, className = "", children }: { title?: ReactNode; right?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`glass ${className}`}>
      {(title || right) && <div className="glass-h">{title && <h3>{title}</h3>}{right}</div>}
      {children}
    </section>
  );
}

// ---------- Big number tile ----------

/** Large thin number with a unit and an optional little trend line underneath */
export function StatTile({ label, value, format: f = "int", unit, sub, spark, warn }: {
  label: string; value: number; format?: Fmt; unit?: string; sub?: ReactNode; spark?: number[]; warn?: boolean;
}) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const p = useProgress(seen, 1600);
  const clip = `sp${useId().replace(/:/g, "")}`;
  const pts = spark && spark.length > 1 ? spark : null;
  const max = pts ? Math.max(1, ...pts) : 1;
  const d = pts ? pts.map((v, i) => `${i ? "L" : "M"}${(i / (pts.length - 1)) * 100},${28 - (v / max) * 24}`).join(" ") : "";
  return (
    <div ref={ref} className={`glass stat-tile${warn ? " warn" : ""}`}>
      <span className="stat-l">{label}</span>
      <span className="stat-v"><span className="tnum">{format(value * p, f)}</span>{unit && <small>{unit}</small>}</span>
      {sub && <span className="stat-s">{sub}</span>}
      {pts && (
        <svg className="stat-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
          <clipPath id={clip}><rect x="0" y="0" width={p * 100} height="30" /></clipPath>
          <path d={d} clipPath={`url(#${clip})`} />
        </svg>
      )}
    </div>
  );
}

// ---------- Ruler gauge ----------

/** A vertical ruler with a slider at the value and a red mark at the target, as in a speed readout */
export function Ruler({ label, value, target, max = 100, unit = "%", sub, empty }: {
  label: string; value: number | null; target: number; max?: number; unit?: string; sub?: ReactNode; empty?: string;
}) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const p = useProgress(seen, 1800);
  const v = value ?? 0;
  const pos = (x: number) => `${100 - (Math.min(max, Math.max(0, x)) / max) * 100}%`;
  const ticks = Array.from({ length: 21 }, (_, i) => (i * max) / 20);
  const ok = value !== null && v >= target;
  return (
    <div ref={ref} className="glass ruler">
      <div className="ruler-scale" aria-hidden="true">
        {ticks.map((t, i) => (
          <span key={i} className={`ruler-t${i % 5 === 0 ? " major" : ""}`} style={{ top: pos(t) }}>{i % 5 === 0 && <b>{Math.round(t)}</b>}</span>
        ))}
        <span className="ruler-target" style={{ top: pos(target) }} />
        {value !== null && <span className="ruler-knob" style={{ top: pos(v * p) }} />}
      </div>
      <div className="ruler-read">
        <span className="stat-l">{label}</span>
        {value === null
          ? <span className="ruler-empty">{empty ?? "No data yet"}</span>
          : <span className="stat-v"><span className="tnum">{Math.round(v * p)}</span><small>{unit}</small></span>}
        <span className="ruler-target-l"><i />Target {target}{unit}</span>
        {value !== null && <span className={`ruler-state ${ok ? "ok" : "low"}`}>{ok ? "On target" : "Below target"}</span>}
        {sub && <span className="stat-s">{sub}</span>}
      </div>
    </div>
  );
}

// ---------- Live timer tile ----------

const span = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
  return d ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s % 60}s`;
};

/** Round icon, a label, and either a live "waiting for" timer (`since`), a countdown (`until`) or a plain value */
export function TimerTile({ icon, label, since, until, value, empty = "Nothing waiting", warnAfterHours }: {
  icon: IconName; label: string; since?: string | null; until?: string | null; value?: ReactNode; empty?: string; warnAfterHours?: number;
}) {
  const [now, setNow] = useState<number | null>(null);
  const live = !!(since || until);
  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);
  const ms = now === null ? null : since ? now - Date.parse(since) : until ? Date.parse(until) - now : null;
  const warn = !!(since && warnAfterHours && ms !== null && ms > warnAfterHours * 3600_000);
  return (
    <div className={`glass timer-tile${warn ? " warn" : ""}`}>
      <span className="timer-ic"><Icon name={icon} /></span>
      <span className="stat-l">{label}</span>
      <span className="timer-v tnum">{value ?? (live ? (ms === null ? "…" : span(ms)) : empty)}</span>
    </div>
  );
}

// ---------- The scanning line chart ----------

type Pt = [number, number];

/** Smooth path through the points without overshooting (monotone cubic) */
function smooth(pts: Pt[]) {
  if (pts.length < 2) return "";
  const n = pts.length, dx: number[] = [], m: number[] = [], t: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / (dx[i] || 1); }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

/** A round top for the axis: four equal steps of 1, 2 or 5 × a power of ten */
function niceMax(v: number) {
  const raw = v / 4;
  if (raw <= 1) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p * 4;
}

/**
 * Many glowing lines drawn in by a scanning band. Days flagged in `warn` turn amber, `bars` rise as faint red bars
 * along the floor, and each marker drops a line to its label under the chart. Hover (or tap) for the exact figures.
 */
export function ScanChart({ title, labels, series, markers = [], warn = [], bars, barsLabel = "Flagged", format: f = "int", summary, empty = "Nothing to show yet.", height = 260, right }: {
  title: string; labels: string[]; series: { name: string; values: number[] }[]; markers?: ChartMarker[]; warn?: number[];
  bars?: number[]; barsLabel?: string; format?: Fmt; summary: string; empty?: string; height?: number; right?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [seenRef, seen] = useSeen<HTMLDivElement>();
  const p = useProgress(seen && w > 0, 2600, 150);
  const uid = `sc${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = labels.length;
  const has = series.some((s) => s.values.some((v) => v > 0));
  const narrow = w > 0 && w < 560;
  const H = narrow ? Math.round(height * 0.8) : height;
  const L = narrow ? 48 : 56, R = 14, T = 16, B = 26;
  const pw = Math.max(1, w - L - R), ph = H - T - B;
  const top = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const x = (i: number) => L + (n > 1 ? (i / (n - 1)) * pw : pw / 2);
  const y = (v: number) => T + ph - (v / top) * ph;
  const step = n > 1 ? pw / (n - 1) : pw;
  const scanX = L + p * pw;

  // Amber ranges: neighbouring flagged days merge into one band
  const ranges: [number, number][] = [];
  for (const i of [...warn].sort((a, b) => a - b)) {
    const a = Math.max(L, x(i) - step / 2), b = Math.min(L + pw, x(i) + step / 2);
    const last = ranges[ranges.length - 1];
    if (last && a <= last[1] + 0.5) last[1] = b; else ranges.push([a, b]);
  }
  const maxBar = bars ? Math.max(1, ...bars) : 1;
  const xTicks = n <= 1 ? [0] : Array.from(new Set(Array.from({ length: narrow ? 4 : 7 }, (_, k) => Math.round((k * (n - 1)) / (narrow ? 3 : 6)))));
  const lead = series[0];
  const tipRows = hover === null ? [] : series.map((s, k) => ({ name: s.name, v: s.values[hover], c: LINE[k % LINE.length] })).filter((r) => r.v > 0).sort((a, z) => z.v - a.v).slice(0, 6);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - L) / pw) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  }

  return (
    <Glass title={title} right={right} className="scan">
      <div ref={seenRef}>
        <figure className="scan-fig" ref={box} style={{ height: H }}>
          <figcaption className="sr-only">{summary}</figcaption>
          {!has && <div className="scan-empty">{empty}</div>}
          {w > 0 && (
            <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} aria-hidden="true" onPointerMove={has ? onMove : undefined} onPointerLeave={() => setHover(null)}>
              <defs>
                <filter id={`${uid}-glow`} x="-5%" y="-30%" width="110%" height="160%">
                  <feGaussianBlur stdDeviation="3.2" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <linearGradient id={`${uid}-beam`} x1="0" x2="1">
                  <stop offset="0" stopColor="#5EF2E6" stopOpacity="0" />
                  <stop offset="1" stopColor="#5EF2E6" stopOpacity=".35" />
                </linearGradient>
                <linearGradient id={`${uid}-bar`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#E3262E" stopOpacity=".75" />
                  <stop offset="1" stopColor="#E3262E" stopOpacity=".05" />
                </linearGradient>
                <linearGradient id={`${uid}-area`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#5EF2E6" stopOpacity=".22" />
                  <stop offset="1" stopColor="#5EF2E6" stopOpacity="0" />
                </linearGradient>
                <clipPath id={`${uid}-scan`}><rect x="0" y="0" width={scanX} height={H} /></clipPath>
                <clipPath id={`${uid}-warn`}>{ranges.map(([a, b], k) => <rect key={k} x={a} y={0} width={b - a} height={H} />)}</clipPath>
              </defs>

              {/* Grid and axis labels */}
              {[0, 0.25, 0.5, 0.75, 1].map((g) => (
                <g key={g} className="scan-grid">
                  <line x1={L} x2={L + pw} y1={y(top * g)} y2={y(top * g)} />
                  <text x={L - 8} y={y(top * g) + 4} textAnchor="end">{format(top * g, f, true)}</text>
                </g>
              ))}
              {xTicks.map((i) => <text key={i} className="scan-x" x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>{labels[i]}</text>)}
              {ranges.map(([a, b], k) => <rect key={k} className="scan-warnband" x={a} y={T} width={b - a} height={ph} />)}

              {has && (
                <g clipPath={`url(#${uid}-scan)`}>
                  {/* Red bars along the floor */}
                  {bars?.map((v, i) => v > 0 && <rect key={i} x={x(i) - Math.max(2, step * 0.18)} y={T + ph - (v / maxBar) * ph * 0.32} width={Math.max(4, step * 0.36)} height={(v / maxBar) * ph * 0.32} fill={`url(#${uid}-bar)`} />)}
                  {/* Soft area under the first line, then every line with a glow */}
                  {lead && <path d={`${smooth(lead.values.map((v, i) => [x(i), y(v)]))} L${x(n - 1)},${T + ph} L${x(0)},${T + ph} Z`} fill={`url(#${uid}-area)`} />}
                  <g filter={`url(#${uid}-glow)`}>
                    {series.map((s, k) => (
                      <path key={s.name} d={smooth(s.values.map((v, i) => [x(i), y(v)]))} className="scan-line" stroke={LINE[k % LINE.length]} strokeOpacity={k === 0 ? 1 : 0.75} />
                    ))}
                  </g>
                  {/* The same lines in amber over flagged days */}
                  {ranges.length > 0 && (
                    <g clipPath={`url(#${uid}-warn)`} filter={`url(#${uid}-glow)`}>
                      {series.map((s) => <path key={s.name} d={smooth(s.values.map((v, i) => [x(i), y(v)]))} className="scan-line" stroke={AMBER} />)}
                    </g>
                  )}
                </g>
              )}

              {/* The scanning band */}
              {has && p > 0 && p < 1 && (
                <g className="scan-beam">
                  <rect x={scanX - 70} y={T} width={70} height={ph} fill={`url(#${uid}-beam)`} />
                  <line x1={scanX} x2={scanX} y1={T - 4} y2={T + ph} />
                </g>
              )}

              {/* Markers: a diamond on the line and a drop line to the label row */}
              {has && markers.map((mk) => {
                const mx = x(mk.at), top2 = Math.min(...series.map((s) => y(s.values[mk.at] ?? 0)));
                const on = p >= (mx - L) / pw - 0.001;
                return (
                  <g key={mk.title + mk.at} className={`scan-mark${on ? " on" : ""}`}>
                    <line x1={mx} x2={mx} y1={top2} y2={T + ph} />
                    <rect x={mx - 5} y={top2 - 5} width={10} height={10} transform={`rotate(45 ${mx} ${top2})`} />
                  </g>
                );
              })}

              {/* The newest point of the first line pulses once drawn */}
              {has && lead && p >= 1 && <circle className="scan-pulse" cx={x(n - 1)} cy={y(lead.values[n - 1])} r={4} />}

              {/* Hover */}
              {hover !== null && (
                <g className="scan-hover">
                  <line x1={x(hover)} x2={x(hover)} y1={T} y2={T + ph} />
                  {series.map((s, k) => s.values[hover] > 0 && <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r={3.5} fill={LINE[k % LINE.length]} />)}
                </g>
              )}
            </svg>
          )}
          {hover !== null && w > 0 && (
            <div className="scan-tip" style={{ left: Math.min(Math.max(x(hover), 90), w - 90) }}>
              <b>{labels[hover]}</b>
              {tipRows.length === 0 && <span className="muted">Nothing</span>}
              {tipRows.map((r) => <span key={r.name}><i style={{ background: r.c }} />{r.name}<em>{format(r.v, f)}</em></span>)}
              {bars && bars[hover] > 0 && <span className="bad"><i />{barsLabel}<em>{bars[hover]}</em></span>}
            </div>
          )}
        </figure>

        {/* Marker labels under their drop lines (a simple list on phones); labels that would overlap drop to a lower row */}
        {has && markers.length > 0 && w > 0 && (() => {
          const LW = 160, ROW = 54;
          const rowEnds: number[] = [];
          const placed = [...markers].sort((a, z) => a.at - z.at).map((mk) => {
            const left = x(mk.at);
            const align = left > w - 130 ? "end" : left < 130 ? "start" : "mid";
            const from = align === "end" ? left - LW : align === "start" ? left : left - LW / 2;
            let row = rowEnds.findIndex((end) => end <= from - 8);
            if (row < 0) { row = rowEnds.length; rowEnds.push(0); }
            rowEnds[row] = from + LW;
            return { mk, left, align, row };
          });
          return (
            <div className={`scan-marks${narrow ? " list" : ""}`} style={narrow ? undefined : { height: rowEnds.length * ROW + 4 }}>
              {placed.map(({ mk, left, align, row }) => {
                const on = p >= (left - L) / pw - 0.001;
                return (
                  <div key={mk.title + mk.at} className={`scan-ml ${align}${on ? " on" : ""}`} style={narrow ? undefined : { left, top: row * ROW }}>
                    {row > 0 && !narrow && <span className="scan-ml-stem" style={{ height: row * ROW }} />}
                    <span className="dot" />
                    <b>{mk.title}</b>
                    <small>{mk.sub}{mk.note && <em> {mk.note}</em>}</small>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {has && series.length > 1 && (
          <div className="scan-legend">
            {series.map((s, k) => (
              <span key={s.name}><i style={{ background: LINE[k % LINE.length], boxShadow: `0 0 8px ${LINE[k % LINE.length]}` }} />{s.name}<em>{format(s.values.reduce((a, b) => a + b, 0), f, true)}</em></span>
            ))}
            {bars && bars.some((b) => b > 0) && <span className="bad"><i />{barsLabel}<em>{bars.reduce((a, b) => a + b, 0)}</em></span>}
          </div>
        )}
      </div>
    </Glass>
  );
}
