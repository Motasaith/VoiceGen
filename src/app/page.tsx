import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  Check,
  Code2,
  Cpu,
  FileAudio,
  Gauge,
  Infinity as InfinityIcon,
  Languages,
  LockKeyhole,
  Mic2,
  Play,
  Sparkles,
  WandSparkles,
} from "lucide-react";

import { CATALOG, LANGUAGE_SUMMARY } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "VoiceGen Studio | Free Local AI Voice Platform",
  description:
    "Generate natural AI narration or clone a voice from 15 seconds of audio. " +
    `${CATALOG.length} voices, ${LANGUAGE_SUMMARY.length} languages, unlimited use, all on your machine.`,
  alternates: { canonical: "/" },
};

const WAVE = [20, 38, 62, 44, 78, 54, 90, 68, 35, 58, 82, 48, 71, 92, 55, 33, 64, 84, 51, 74, 42, 66, 88, 58, 30, 48, 72, 39, 61, 24];

const FEATURES = [
  {
    icon: Languages,
    title: "A voice for every story",
    body: `${CATALOG.length} expressive voices across ${LANGUAGE_SUMMARY.length} languages, with precise control over pace, pitch, and pauses.`,
  },
  {
    icon: Mic2,
    title: "Clone a voice in seconds",
    body: "Create a reusable voice from a short, clean recording. Built-in quality checks help you get a strong result the first time.",
  },
  {
    icon: FileAudio,
    title: "Made for long-form audio",
    body: "Generate complete scripts and chapters with sentence-aware chunking, natural pacing, and seamless final assembly.",
  },
  {
    icon: Sparkles,
    title: "Design original voices",
    body: "Blend up to four speakers with custom weights to create a distinctive, stable voice for your brand or character.",
  },
  {
    icon: Gauge,
    title: "Ready for publishing",
    body: "Export MP3 or WAV with platform-ready loudness. Add timestamped SRT and VTT subtitles in the same generation.",
  },
  {
    icon: Code2,
    title: "Automate your workflow",
    body: "Use the local HTTP API from scripts, n8n, Make, or your own product. No external key or usage billing required.",
  },
];

const USE_CASES = [
  ["Creator videos", "Narration for YouTube, short-form video, explainers, and branded content."],
  ["Audiobooks", "Consistent long-form voices with natural paragraph and sentence pacing."],
  ["Product experiences", "Fast local speech generation for prototypes, tools, and interactive products."],
  ["Characters", "Distinct voices for dialogue, games, education, and narrative projects."],
];

export default function HomePage() {
  return (
    <div className="fade-in">
      <section className="relative overflow-hidden rounded-[24px] border px-6 py-10 sm:px-10 sm:py-14 xl:px-14 xl:py-16" style={{ borderColor: "var(--color-line)", background: "linear-gradient(145deg, color-mix(in srgb, var(--color-brand) 8%, var(--color-surface)), var(--color-surface) 55%)" }}>
        <div className="pointer-events-none absolute -right-32 -top-48 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, var(--color-brand), transparent 65%)" }} />
        <div className="relative grid min-w-0 items-center gap-12 xl:grid-cols-[1.02fr_.98fr] xl:gap-16">
          <div className="min-w-0">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.72rem] font-semibold" style={{ borderColor: "color-mix(in srgb, var(--color-brand) 30%, var(--color-line))", background: "color-mix(in srgb, var(--color-brand) 9%, transparent)", color: "color-mix(in srgb, var(--color-brand) 80%, white)" }}>
              <span className="status-dot is-online" />
              Private AI audio workspace
            </div>
            <h1 className="mb-5 max-w-[12ch] text-[clamp(2.65rem,5.8vw,5.35rem)] font-semibold leading-[.98] tracking-[-0.065em]">
              Your words, in the <span className="grad-text">perfect voice.</span>
            </h1>
            <p className="mb-8 max-w-[55ch] text-[1rem] leading-7 sm:text-[1.08rem]" style={{ color: "var(--color-ink-dim)" }}>
              Create lifelike speech, design original voices, and clone your own. Everything runs locally, so your audio stays private and your usage stays unlimited.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/studio" className="btn btn-primary btn-lg w-full sm:w-auto">
                Create your first voice <ArrowRight size={16} />
              </Link>
              <Link href="/voices" className="btn btn-lg w-full sm:w-auto">
                <Play size={15} fill="currentColor" /> Explore voices
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[0.75rem]" style={{ color: "var(--color-ink-faint)" }}>
              {["No account", "No API keys", "Commercial use", "Runs offline"].map((item) => (
                <span key={item} className="flex items-center gap-1.5"><Check size={12} style={{ color: "var(--color-ok)" }} />{item}</span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto min-w-0 w-full max-w-[560px]">
            <div className="absolute -inset-5 rounded-[30px] opacity-40 blur-2xl" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--color-brand) 34%, transparent), transparent 55%, color-mix(in srgb, var(--color-brand-2) 20%, transparent))" }} />
            <div className="relative overflow-hidden rounded-[20px] border shadow-2xl" style={{ borderColor: "var(--color-line-strong)", background: "var(--color-bg-soft)", boxShadow: "0 28px 80px rgba(0,0,0,.34)" }}>
              <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}>
                <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#fb7185]" /><span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]" /><span className="h-2.5 w-2.5 rounded-full bg-[#4ade80]" /></div>
                <span className="mx-auto pr-10 text-[0.7rem] font-medium" style={{ color: "var(--color-ink-faint)" }}>VoiceGen Studio</span>
              </div>
              <div className="p-5 sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "linear-gradient(135deg, var(--color-brand), #6d4dd5)" }}><WandSparkles size={18} color="white" /></div>
                  <div><div className="text-[0.83rem] font-semibold">Create speech</div><div className="text-[0.68rem]" style={{ color: "var(--color-ink-faint)" }}>Natural narration in one click</div></div>
                  <span className="ml-auto badge badge-ok">Ready</span>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}>
                  <p className="m-0 text-[0.87rem] leading-6" style={{ color: "var(--color-ink-dim)" }}>
                    Great stories deserve a voice that feels human. Clear, expressive, and ready when inspiration strikes.
                  </p>
                  <div className="mt-7 flex h-20 items-center gap-[4px]" aria-label="Audio waveform preview">
                    {WAVE.map((height, index) => (
                      <span key={index} className="flex-1 rounded-full" style={{ height: `${height}%`, minWidth: 2, background: index < 18 ? "linear-gradient(to top, var(--color-brand), var(--color-brand-2))" : "var(--color-surface-3)", opacity: index < 18 ? .9 : .65 }} />
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full text-white" style={{ background: "var(--color-brand)" }}><Play size={14} fill="currentColor" /></span>
                    <span className="text-[0.72rem] tabular-nums" style={{ color: "var(--color-ink-faint)" }}>00:18</span>
                    <div className="h-1 flex-1 rounded-full" style={{ background: "var(--color-surface-3)" }}><div className="h-full w-[58%] rounded-full" style={{ background: "var(--color-brand)" }} /></div>
                    <span className="text-[0.72rem] font-medium">MP3</span>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}><div className="mb-1 text-[0.65rem] uppercase tracking-wider" style={{ color: "var(--color-ink-faint)" }}>Voice</div><div className="text-[0.8rem] font-semibold">Heart · Warm</div></div>
                  <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}><div className="mb-1 text-[0.65rem] uppercase tracking-wider" style={{ color: "var(--color-ink-faint)" }}>Output</div><div className="text-[0.8rem] font-semibold">Studio quality</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid border-x border-b sm:grid-cols-2 xl:grid-cols-4" style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}>
        {[
          [LockKeyhole, "100% private", "Audio never leaves your machine"],
          [InfinityIcon, "Unlimited", "No credits or character caps"],
          [Cpu, "Built for local AI", "Optimized for CPU inference"],
          [AudioLines, `${CATALOG.length} voices`, `${LANGUAGE_SUMMARY.length} languages and custom blends`],
        ].map(([Icon, title, body], index) => {
          const StatIcon = Icon as typeof LockKeyhole;
          return (
            <div key={String(title)} className={`flex gap-3.5 p-5 sm:p-6 ${index > 0 ? "xl:border-l" : ""} ${index % 2 ? "sm:border-l" : ""}`} style={{ borderColor: "var(--color-line)" }}>
              <StatIcon size={18} style={{ color: "var(--color-brand)", marginTop: 2 }} />
              <div><div className="text-[0.84rem] font-semibold">{String(title)}</div><div className="mt-1 text-[0.72rem]" style={{ color: "var(--color-ink-faint)" }}>{String(body)}</div></div>
            </div>
          );
        })}
      </section>

      <section className="py-20 sm:py-24">
        <div className="mb-10 max-w-[650px]">
          <div className="page-kicker">One complete voice platform</div>
          <h2 className="m-0 text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.06] tracking-[-0.055em]">Everything you need to turn ideas into audio.</h2>
          <p className="mt-4 text-[0.95rem] leading-7" style={{ color: "var(--color-ink-dim)" }}>A focused production workflow with the control professionals expect and none of the cloud overhead.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article key={title} className="card group min-h-[210px] transition-transform hover:-translate-y-1">
              <div className="mb-8 grid h-10 w-10 place-items-center rounded-xl border" style={{ borderColor: "color-mix(in srgb, var(--color-brand) 24%, var(--color-line))", background: "color-mix(in srgb, var(--color-brand) 9%, var(--color-surface))", color: "var(--color-brand)" }}><Icon size={19} /></div>
              <h3 className="mb-2 text-[1rem] font-semibold tracking-[-.02em]">{title}</h3>
              <p className="m-0 text-[0.82rem] leading-6" style={{ color: "var(--color-ink-dim)" }}>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[22px] border" style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}>
        <div className="grid lg:grid-cols-[.85fr_1.15fr]">
          <div className="border-b p-7 sm:p-10 lg:border-b-0 lg:border-r" style={{ borderColor: "var(--color-line)" }}>
            <div className="page-kicker">Built for real workflows</div>
            <h2 className="mb-4 text-[clamp(1.8rem,3vw,2.65rem)] font-semibold leading-tight tracking-[-.045em]">From a single line to a complete production.</h2>
            <p className="mb-7 text-[0.9rem] leading-7" style={{ color: "var(--color-ink-dim)" }}>Create once in the Studio, reuse voices across projects, then connect the API when you are ready to scale.</p>
            <Link href="/studio" className="btn">Open Studio <ArrowRight size={15} /></Link>
          </div>
          <div className="grid sm:grid-cols-2">
            {USE_CASES.map(([title, body], index) => (
              <div key={title} className={`p-7 sm:p-8 ${index % 2 ? "sm:border-l" : ""} ${index > 1 ? "border-t" : index > 0 ? "border-t sm:border-t-0" : ""}`} style={{ borderColor: "var(--color-line)" }}>
                <span className="mb-6 block font-mono text-[0.7rem]" style={{ color: "var(--color-brand)" }}>0{index + 1}</span>
                <h3 className="mb-2 text-[0.95rem] font-semibold">{title}</h3>
                <p className="m-0 text-[0.8rem] leading-6" style={{ color: "var(--color-ink-dim)" }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="my-20 text-center sm:my-24">
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--color-brand) 13%, var(--color-surface))", color: "var(--color-brand)" }}><AudioLines size={22} /></div>
        <h2 className="mx-auto mb-4 max-w-[680px] text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-tight tracking-[-.055em]">Make something worth listening to.</h2>
        <p className="mx-auto mb-7 max-w-[52ch] text-[0.94rem]" style={{ color: "var(--color-ink-dim)" }}>Your first generation is a few clicks away. No signup, setup wizard, or usage meter.</p>
        <Link href="/studio" className="btn btn-primary btn-lg">Start creating <ArrowRight size={16} /></Link>
      </section>
    </div>
  );
}
