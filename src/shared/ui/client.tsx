"use client";

import { createContext, useActionState, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "./icon";
import type { ActionResult } from "../lib/action";

// ---------------- Toasts ----------------
type Toast = { id: number; msg: string; ok: boolean };
const ToastCtx = createContext<(msg: string, ok?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((msg: string, ok = true) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-2), { id, msg, ok }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`toast ${t.ok ? "ok" : ""}`}>
            <Icon name={t.ok ? "check" : "info"} />
            <span className="grow">{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------- Forms bound to server actions ----------------
type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;
const FormResultCtx = createContext<ActionResult>({ ok: false });
export const useFormResult = () => useContext(FormResultCtx);

/**
 * <ActionForm action={serverAction}> — runs the action, shows its message as a toast,
 * exposes field errors to <FieldError>, and follows result.redirect.
 */
export function ActionForm({ action, children, className, onDone, resetOnSuccess, id }: {
  action: Action; children: ReactNode; className?: string; onDone?: (r: ActionResult) => void; resetOnSuccess?: boolean; id?: string;
}) {
  const [state, formAction] = useActionState(action, { ok: false });
  const toast = useToast();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const last = useRef<ActionResult | null>(null);
  useEffect(() => {
    if (state === last.current || (!state.message && !state.redirect && !state.ok)) return;
    last.current = state;
    if (state.message) toast(state.message, state.ok);
    if (state.ok && resetOnSuccess) ref.current?.reset();
    onDone?.(state);
    if (state.redirect) {
      if (/^https?:\/\//.test(state.redirect)) window.location.assign(state.redirect);
      else router.push(state.redirect);
    }
    else if (state.ok) router.refresh();
  }, [state, toast, router, onDone, resetOnSuccess]);
  return (
    <FormResultCtx.Provider value={state}>
      <form ref={ref} action={formAction} className={className} id={id} noValidate>
        {children}
      </form>
    </FormResultCtx.Provider>
  );
}

export function FieldError({ name }: { name: string }) {
  const r = useFormResult();
  const msg = r.fieldErrors?.[name];
  return msg ? <span className="field-error">{msg}</span> : null;
}

export function SubmitButton({ children, variant = "primary", size, block, icon, confirmText, disabled, name, value }: {
  children: ReactNode; variant?: string; size?: "sm" | "lg"; block?: boolean; icon?: string; confirmText?: string; disabled?: boolean; name?: string; value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={["btn", variant !== "default" && variant, size, block && "block"].filter(Boolean).join(" ")}
      disabled={pending || disabled}
      onClick={(e) => { if (confirmText && !window.confirm(confirmText)) e.preventDefault(); }}
    >
      {pending ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : icon ? <Icon name={icon} size="sm" /> : null}
      {children}
    </button>
  );
}

// ---------------- Dialog ----------------
export function Dialog({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dlg" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <div className={`modal ${wide ? "wide" : ""}`} role="document">
          <div className="modal-h">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal-b">{children}</div>
          {footer && <div className="modal-f">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ---------------- URL-driven search box (debounced) ----------------
export function SearchParamInput({ param, placeholder, id, width }: { param: string; placeholder: string; id: string; width?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [v, setV] = useState(sp.get(param) ?? "");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return (
    <div className="search grow" style={{ minWidth: width ?? 220 }}>
      <Icon name="search" size="sm" />
      <input
        className="input"
        id={id}
        value={v}
        placeholder={placeholder}
        onChange={(e) => {
          const val = e.target.value;
          setV(val);
          if (t.current) clearTimeout(t.current);
          t.current = setTimeout(() => {
            const next = new URLSearchParams(sp.toString());
            if (val) next.set(param, val); else next.delete(param);
            next.delete("page");
            router.replace(`${pathname}?${next.toString()}`, { scroll: false });
          }, 250);
        }}
      />
    </div>
  );
}

/** A <select> that updates one URL parameter */
export function SearchParamSelect({ param, options, id, label }: { param: string; options: [string, string][]; id: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <select
      className="input" id={id} aria-label={label} style={{ width: "auto" }}
      value={sp.get(param) ?? options[0][0]}
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        if (e.target.value && e.target.value !== options[0][0]) next.set(param, e.target.value); else next.delete(param);
        next.delete("page");
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }}
    >
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export function CopyButton({ text, label = "Copy", done }: { text: string; label?: string; done?: string }) {
  const toast = useToast();
  return (
    <button type="button" className="btn sm ghost" onClick={() => {
      navigator.clipboard?.writeText(text).then(() => toast(done ?? `Copied ${text}`)).catch(() => toast(`Copy this: ${text}`, false));
    }}>
      <Icon name="copy" size="sm" /> {label}
    </button>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    setDark(t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  return (
    <button type="button" className="icon-btn" aria-label={`Switch to ${dark ? "light" : "dark"} mode`} onClick={() => {
      const next = dark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      document.cookie = `naz_theme=${next}; path=/; max-age=31536000; samesite=lax`;
      setDark(!dark);
    }}>
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}
