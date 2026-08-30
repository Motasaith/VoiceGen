"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // The clipboard API needs a secure context; fall back to a temp textarea.
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.append(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* user can select manually */ }
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="relative">
      <pre
        className="scroll-x m-0 rounded-[9px] border p-4 text-[0.8rem] leading-relaxed"
        style={{ background: "var(--color-bg-soft)", borderColor: "var(--color-line)" }}
      >
        <code>{code}</code>
      </pre>
      <button
        onClick={copy}
        className="btn btn-sm absolute right-2 top-2"
        aria-label="Copy code"
      >
        {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
      </button>
    </div>
  );
}
