"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Search, X, ChevronDown } from "lucide-react";

import { notifyError } from "./Toast";

export interface BlendComponent { voice: string; weight: number }
export type VoiceSpec = string | BlendComponent[];

export interface VoiceEntry {
  id: string;
  name: string;
  language: string;
  flag: string;
  gender: string;
  note: string;
  tier: string;
  tags: string[];
  kind: "stock" | "blend" | "clone";
  components?: BlendComponent[];
  quality?: number;
  saved?: boolean;
}

export interface VoicesPayload {
  stock: any[];
  presets: any[];
  saved: any[];
  languages: { label: string; flag: string; count: number }[];
  unsupportedNote: string;
  cloneReady: boolean;
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

export function useVoices() {
  const [data, setData] = useState<VoicesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const res = await fetch("/api/voices");
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not load voices");
      setData(await res.json());
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => { reload(); }, []);
  return { data, error, reload };
}

/** Flatten stock voices, preset blends and saved voices into one list. */
export function flattenVoices(data: VoicesPayload | null): VoiceEntry[] {
  if (!data) return [];
  const out: VoiceEntry[] = [];

  for (const v of data.stock) out.push({ ...v, kind: "stock" });

  for (const p of data.presets) {
    out.push({
      id: p.id, name: p.name, language: "Blend", flag: "🎛️", gender: "neutral",
      note: p.desc, tier: "blend", tags: ["preset"], kind: "blend",
      components: p.components,
    });
  }

  for (const s of data.saved) {
    out.push({
      id: s.id,
      name: s.name,
      language: s.kind === "clone" ? "Cloned" : "Blend",
      flag: s.kind === "clone" ? "👤" : "🎛️",
      gender: "neutral",
      note: s.description || (s.kind === "clone" ? "Your cloned voice." : "Your saved blend."),
      tier: s.kind,
      tags: s.tags ?? [],
      kind: s.kind,
      components: s.blend ?? undefined,
      quality: s.quality,
      saved: true,
    });
  }
  return out;
}

/** Turn a picker selection into the value the API expects. */
export function toRequestVoice(entry: VoiceEntry | undefined, id: VoiceSpec): VoiceSpec {
  if (Array.isArray(id)) return id;
  if (entry?.saved) return `clone:${entry.id}`;
  return id;
}

/* ------------------------------------------------------------------ */
/* Preview button                                                      */
/* ------------------------------------------------------------------ */

const previewCache = new Map<string, string>();
let activeAudio: HTMLAudioElement | null = null;

export function PreviewButton({ spec, small = false }: { spec: VoiceSpec; small?: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (state === "playing") {
      audioRef.current?.pause();
      setState("idle");
      return;
    }

    activeAudio?.pause();
    setState("loading");
    const key = JSON.stringify(spec);

    try {
      let url = previewCache.get(key);
      if (!url) {
        const res = await fetch("/api/voices/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voice: spec }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Preview failed");
        url = URL.createObjectURL(await res.blob());
        previewCache.set(key, url);
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      activeAudio = audio;
      audio.addEventListener("ended", () => setState("idle"));
      audio.addEventListener("pause", () => setState("idle"));
      await audio.play();
      setState("playing");
    } catch (err: any) {
      notifyError(err.message);
      setState("idle");
    }
  };

  const size = small ? 13 : 15;
  return (
    <button
      onClick={onClick}
      className={`btn ${small ? "btn-sm" : ""} ${state === "playing" ? "btn-primary" : ""}`}
      style={{ width: small ? 30 : 36, height: small ? 28 : 34, padding: 0 }}
      aria-label="Preview this voice"
      title="Preview"
    >
      {state === "loading" ? (
        <span className="spinner" style={{ width: size, height: size }} />
      ) : state === "playing" ? (
        <Pause size={size} />
      ) : (
        <Play size={size} />
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export function specFor(entry: VoiceEntry): VoiceSpec {
  if (entry.kind === "blend" && entry.components && !entry.saved) return entry.components;
  if (entry.saved) return `clone:${entry.id}`;
  return entry.id;
}

export function VoiceCard({
  entry, selected, onSelect,
}: {
  entry: VoiceEntry;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  return (
    <div
      onClick={() => onSelect?.(entry.id)}
      className="card cursor-pointer transition-all hover:-translate-y-0.5"
      style={{
        padding: 15,
        borderColor: selected ? "var(--color-brand)" : "var(--color-line)",
        background: selected
          ? "color-mix(in srgb, var(--color-brand) 7%, var(--color-surface))"
          : "var(--color-surface)",
      }}
    >
      <div className="mb-2.5 flex items-center gap-3">
        <span
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] text-base font-bold text-white"
          style={{ background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-2))" }}
        >
          {entry.flag || entry.name.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 truncate text-[0.93rem] font-semibold">{entry.name}</h3>
          <div className="text-[0.76rem]" style={{ color: "var(--color-ink-dim)" }}>
            {entry.language}
            {entry.gender !== "neutral" ? ` · ${entry.gender}` : ""}
          </div>
        </div>
      </div>

      <p
        className="m-0 mb-2.5 min-h-[2.4em] text-[0.8rem] leading-relaxed"
        style={{ color: "var(--color-ink-dim)" }}
      >
        {entry.note}
      </p>

      <div className="flex items-center gap-1.5">
        <PreviewButton spec={specFor(entry)} small />
        {onSelect && (
          <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); onSelect(entry.id); }}>
            Use
          </button>
        )}
        <span className="flex-1" />
        {entry.tier === "flagship" && <span className="badge badge-brand">Top pick</span>}
        {entry.tier === "great" && <span className="badge badge-ok">Recommended</span>}
        {entry.kind === "clone" && (
          <span
            className={`badge ${
              (entry.quality ?? 0) >= 75 ? "badge-ok" : (entry.quality ?? 0) >= 50 ? "badge-warn" : "badge-bad"
            }`}
          >
            Quality {entry.quality ?? 0}
          </span>
        )}
        {entry.kind === "blend" && <span className="badge">Blend</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal picker                                                        */
/* ------------------------------------------------------------------ */

export function VoicePickerButton({
  value, entries, onChange,
}: {
  value: string;
  entries: VoiceEntry[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const current = entries.find((e) => e.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      `${e.name} ${e.language} ${e.note} ${e.tags.join(" ")}`.toLowerCase().includes(q),
    );
  }, [entries, query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-[9px] border px-3 py-2.5 text-left transition-colors"
        style={{ background: "var(--color-bg-soft)", borderColor: "var(--color-line)" }}
      >
        <span
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-2))" }}
        >
          {current?.flag ?? "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9rem] font-semibold">
            {current?.name ?? value}
          </span>
          <span className="block text-[0.76rem]" style={{ color: "var(--color-ink-dim)" }}>
            {current ? `${current.language}${current.gender !== "neutral" ? ` · ${current.gender}` : ""}` : "Not available"}
          </span>
        </span>
        <ChevronDown size={16} style={{ color: "var(--color-ink-dim)" }} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] grid place-items-center p-5 backdrop-blur-sm"
          style={{ background: "rgba(4,6,12,0.72)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="fade-in flex max-h-[88vh] w-full max-w-[880px] flex-col rounded-[22px] border p-6 shadow-2xl"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-line-strong)" }}
          >
            <div className="mb-4 flex items-center gap-3">
              <h2 className="m-0 text-[1.2rem] font-semibold">Choose a voice</h2>
              <span className="flex-1" />
              <button className="btn btn-ghost" style={{ width: 34, height: 34, padding: 0 }} onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="relative mb-4">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--color-ink-faint)" }}
              />
              <input
                autoFocus
                className="input pl-9"
                placeholder="Search voices…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="grid flex-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.length === 0 && (
                <p className="col-span-full" style={{ color: "var(--color-ink-dim)" }}>
                  No voices match that search.
                </p>
              )}
              {filtered.map((entry) => (
                <VoiceCard
                  key={entry.id}
                  entry={entry}
                  selected={entry.id === value}
                  onSelect={(id) => { onChange(id); setOpen(false); }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
