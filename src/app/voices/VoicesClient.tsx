"use client";

import { useMemo, useState } from "react";
import { Plus, Search, X, Trash2, Info } from "lucide-react";

import { notifyError, notifyOk } from "@/components/Toast";
import {
  flattenVoices, useVoices, VoiceCard, PreviewButton, type VoiceEntry,
} from "@/components/VoicePicker";

export function VoicesClient() {
  const { data, error, reload } = useVoices();
  const entries = useMemo(() => flattenVoices(data), [data]);

  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [gender, setGender] = useState("");
  const [kind, setKind] = useState("");
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [blendOpen, setBlendOpen] = useState(false);

  const languages = useMemo(
    () => [...new Set(entries.map((e) => e.language))].sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (q && !`${e.name} ${e.language} ${e.note} ${e.tags.join(" ")}`.toLowerCase().includes(q)) return false;
      if (language && e.language !== language) return false;
      if (gender && e.gender !== gender) return false;
      if (kind && e.kind !== kind) return false;
      if (recommendedOnly && !["flagship", "great"].includes(e.tier)) return false;
      return true;
    });
  }, [entries, query, language, gender, kind, recommendedOnly]);

  const grouped = useMemo(() => {
    const map = new Map<string, VoiceEntry[]>();
    for (const entry of filtered) {
      const key =
        entry.kind === "stock" ? entry.language
        : entry.kind === "clone" ? "Your cloned voices"
        : "Blends";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    return map;
  }, [filtered]);

  const deleteVoice = async (entry: VoiceEntry) => {
    if (!confirm(`Delete “${entry.name}”? This removes it from this machine.`)) return;
    try {
      const res = await fetch(`/api/voices/${entry.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      notifyOk("Deleted.");
      reload();
    } catch (err: any) {
      notifyError(err.message);
    }
  };

  return (
    <div className="fade-in">
      <header className="mb-8">
        <div className="page-kicker">Voice library</div>
        <h1 className="page-title">Find your voice</h1>
        <p className="page-description">
          Every built-in voice, your saved blends, and your cloned voices. Press play on
          any card to hear it.
        </p>
      </header>

      {error && <div className="alert alert-bad mb-5">{error}</div>}

      {data?.unsupportedNote && (
        <div className="alert alert-info mb-5">
          <Info size={17} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>{data.unsupportedNote}</div>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--color-ink-faint)" }} />
          <input
            className="input max-w-[250px] pl-9"
            placeholder="Search voices…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <select className="input max-w-[175px]" value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="">All languages</option>
          {languages.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>

        <select className="input max-w-[150px]" value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="">Any gender</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
        </select>

        <select className="input max-w-[150px]" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          <option value="stock">Built-in</option>
          <option value="blend">Blends</option>
          <option value="clone">Cloned</option>
        </select>

        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={recommendedOnly}
            onChange={(e) => setRecommendedOnly(e.target.checked)}
            style={{ accentColor: "var(--color-brand)" }}
          />
          <span className="text-[0.83rem]">Recommended only</span>
        </label>

        <span className="flex-1" />
        <button className="btn btn-sm" onClick={() => setBlendOpen(true)}>
          <Plus size={14} /> Create a blend
        </button>
      </div>

      {!data && <div className="flex items-center gap-2"><span className="spinner" /> Loading voices…</div>}

      {data && filtered.length === 0 && (
        <div className="py-14 text-center" style={{ color: "var(--color-ink-faint)" }}>
          <h2 className="text-[1.1rem]">Nothing matches</h2>
          <p>Try clearing a filter.</p>
        </div>
      )}

      {[...grouped.entries()].map(([group, items]) => (
        <section key={group} className="mb-7">
          <h2 className="mb-3 text-[0.95rem] font-semibold" style={{ color: "var(--color-ink-dim)" }}>
            {group} · {items.length}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((entry) => (
              <div key={entry.id} className="relative">
                <VoiceCard entry={entry} />
                {entry.saved && (
                  <button
                    onClick={() => deleteVoice(entry)}
                    className="btn btn-ghost absolute right-2 top-2"
                    style={{ width: 28, height: 28, padding: 0 }}
                    title="Delete"
                    aria-label={`Delete ${entry.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {blendOpen && (
        <BlendBuilder
          stock={entries.filter((e) => e.kind === "stock")}
          onClose={() => setBlendOpen(false)}
          onSaved={() => { setBlendOpen(false); reload(); }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BlendBuilder({
  stock, onClose, onSaved,
}: {
  stock: VoiceEntry[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState([
    { voice: "af_heart", weight: 0.6 },
    { voice: "af_nova", weight: 0.4 },
  ]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (i: number, patch: Partial<{ voice: string; weight: number }>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!name.trim()) { notifyError("Give the blend a name."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/voices/blends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), components: rows, description }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      notifyOk(`Saved “${name}”.`);
      onSaved();
    } catch (err: any) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center p-5 backdrop-blur-sm"
      style={{ background: "rgba(4,6,12,0.72)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="fade-in max-h-[88vh] w-full max-w-[620px] overflow-y-auto rounded-[22px] border p-6 shadow-2xl"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-line-strong)" }}
      >
        <div className="mb-2 flex items-center gap-3">
          <h2 className="m-0 text-[1.2rem] font-semibold">Create a blended voice</h2>
          <span className="flex-1" />
          <button className="btn btn-ghost" style={{ width: 34, height: 34, padding: 0 }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <p className="hint mb-4">
          Mixing two or three voices produces a new, stable speaker. Weights are relative,
          they are normalised for you.
        </p>

        {rows.map((row, i) => (
          <div
            key={i}
            className="mb-2 flex items-center gap-2.5 rounded-[9px] border p-2.5"
            style={{ background: "var(--color-surface-2)", borderColor: "var(--color-line)" }}
          >
            <select
              className="input flex-1"
              value={row.voice}
              onChange={(e) => update(i, { voice: e.target.value })}
            >
              {stock.map((v) => (
                <option key={v.id} value={v.id}>{v.flag} {v.name} · {v.language}</option>
              ))}
            </select>
            <input
              type="range" className="range" style={{ width: 105 }}
              min={0.05} max={1} step={0.05}
              value={row.weight}
              onChange={(e) => update(i, { weight: Number(e.target.value) })}
            />
            <span className="w-10 text-right font-mono text-[0.8rem]" style={{ color: "var(--color-ink-dim)" }}>
              {row.weight.toFixed(2)}
            </span>
            <button
              className="btn btn-ghost"
              style={{ width: 30, height: 28, padding: 0 }}
              onClick={() => rows.length > 2
                ? setRows((prev) => prev.filter((_, j) => j !== i))
                : notifyError("A blend needs at least two voices.")}
            >
              <X size={13} />
            </button>
          </div>
        ))}

        <div className="mb-5 flex gap-2">
          <button
            className="btn btn-sm"
            onClick={() => rows.length < 4
              ? setRows((prev) => [...prev, { voice: "am_michael", weight: 0.4 }])
              : notifyError("Four voices is the maximum.")}
          >
            <Plus size={13} /> Add a voice
          </button>
          <PreviewButton spec={rows} />
          <span className="hint self-center">Hear the mix before saving</span>
        </div>

        <div className="mb-4">
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                 placeholder="e.g. Channel narrator" />
        </div>
        <div className="mb-5">
          <label className="label">Description</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)}
                 placeholder="Optional" />
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner" /> Saving…</> : "Save voice"}
          </button>
        </div>
      </div>
    </div>
  );
}
