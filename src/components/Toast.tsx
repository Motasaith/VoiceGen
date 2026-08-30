"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastKind = "ok" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

/* A tiny event bus so any component can raise a toast without prop drilling. */
const listeners = new Set<(t: Toast) => void>();
let nextId = 1;

export function toast(message: string, kind: ToastKind = "info") {
  const item = { id: nextId++, message, kind };
  listeners.forEach((fn) => fn(item));
}

export const notifyOk = (m: string) => toast(m, "ok");
export const notifyError = (m: string) => toast(m, "error");

const ICONS = { ok: CheckCircle2, error: AlertCircle, info: Info };
const COLORS = {
  ok: "var(--color-ok)",
  error: "var(--color-bad)",
  info: "var(--color-brand)",
};

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (item: Toast) => {
      setItems((prev) => [...prev, item]);
      // Errors linger; successes get out of the way.
      const ttl = item.kind === "error" ? 8000 : 4200;
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== item.id)), ttl);
    };
    listeners.add(onToast);
    return () => { listeners.delete(onToast); };
  }, []);

  if (!items.length) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[999] flex max-w-[380px] flex-col gap-2">
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        return (
          <div
            key={item.id}
            className="fade-in flex items-start gap-2.5 rounded-[9px] border px-4 py-3 text-[0.87rem] shadow-2xl"
            style={{
              background: "var(--color-surface-2)",
              borderColor: COLORS[item.kind],
            }}
            role="status"
          >
            <Icon size={17} style={{ color: COLORS[item.kind], flexShrink: 0, marginTop: 2 }} />
            <span className="flex-1">{item.message}</span>
            <button
              onClick={() => setItems((prev) => prev.filter((t) => t.id !== item.id))}
              className="opacity-50 transition-opacity hover:opacity-100"
              aria-label="Dismiss"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
