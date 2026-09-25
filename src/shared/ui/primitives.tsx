import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./icon";
import { colorFor, initials } from "../lib/format";

type BtnVariant = "primary" | "dark" | "ghost" | "danger" | "success" | "default";
export function btnClass(variant: BtnVariant = "default", size?: "sm" | "lg", block?: boolean) {
  return ["btn", variant !== "default" && variant, size, block && "block"].filter(Boolean).join(" ");
}

export function LinkButton(props: { href: string; children: ReactNode; variant?: BtnVariant; size?: "sm" | "lg"; icon?: string; block?: boolean; prefetch?: boolean }) {
  return (
    <Link href={props.href} className={btnClass(props.variant, props.size, props.block)} prefetch={props.prefetch}>
      {props.icon && <Icon name={props.icon} size="sm" />}
      {props.children}
    </Link>
  );
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-h">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "", pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <section className={`card ${pad ? "" : "pad-0"} ${className}`}>{children}</section>;
}

export function CardHeader({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <div className="card-h">
      {typeof title === "string" ? <h3>{title}</h3> : title}
      {right}
    </div>
  );
}

export function Pill({ tone = "plain", children, dot = true }: { tone?: "ok" | "warn" | "info" | "err" | "violet" | "plain"; children: ReactNode; dot?: boolean }) {
  return <span className={`pill ${tone} ${dot ? "" : "plain"}`}>{children}</span>;
}

export function Note({ tone = "info", icon = "info", children }: { tone?: "info" | "warn" | "err" | "ok"; icon?: string; children: ReactNode }) {
  return (
    <div className={`note ${tone === "info" ? "" : tone}`}>
      <Icon name={icon} />
      <span>{children}</span>
    </div>
  );
}

export function Avatar({ id, first, last, size = "md", dark }: { id: string; first: string; last: string; size?: "sm" | "md" | "lg"; dark?: boolean }) {
  const style: CSSProperties = { background: dark ? "var(--ink)" : colorFor(id) };
  if (size === "sm") Object.assign(style, { width: 26, height: 26, fontSize: 10 });
  return <span className={`avatar ${size === "lg" ? "lg" : ""}`} style={style}>{initials(first, last)}</span>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "warn" }) {
  return (
    <div className="card kpi">
      <span className="l">{label}</span>
      <span className="v" style={tone === "warn" ? { color: "var(--warn)" } : undefined}>{value}</span>
      {sub && <span className="small muted">{sub}</span>}
    </div>
  );
}

export function Field({ label, htmlFor, error, hint, children }: { label: ReactNode; htmlFor?: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function Bars({ rows, color }: { rows: [string, number, string][]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="bars">
      {rows.map(([label, v, shown]) => (
        <div className="b" key={label}>
          <span>{label}</span>
          <span className="track"><span style={{ width: `${(v / max) * 100}%`, background: color }} /></span>
          <b className="tnum" style={{ textAlign: "right" }}>{shown}</b>
        </div>
      ))}
    </div>
  );
}
