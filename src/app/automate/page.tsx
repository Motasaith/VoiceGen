import type { Metadata } from "next";
import { Info, ShieldCheck } from "lucide-react";

import { CodeBlock } from "@/components/CodeBlock";

export const metadata: Metadata = {
  title: "Automate",
  description:
    "Drive VoiceGen from a script, a scheduler, n8n or Make. One HTTP call in, " +
    "audio bytes out, with full curl, Python and Node examples.",
  alternates: { canonical: "/automate" },
};

const CURL = `# Generate an MP3 and save it
curl -X POST http://localhost:3000/api/tts/speak \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Welcome back to the channel.",
    "voice": "af_heart",
    "format": "mp3",
    "loudness": -14
  }' \\
  --output narration.mp3`;

const PYTHON = `import requests

r = requests.post(
    "http://localhost:3000/api/tts/speak",
    json={
        "text": open("script.txt", encoding="utf-8").read(),
        "voice": "af_heart",        # or "clone:vc_xxxx"
        "format": "mp3",
        "loudness": -14,            # YouTube / Facebook target
    },
    timeout=3600,
)
r.raise_for_status()
open("narration.mp3", "wb").write(r.content)

print("seconds:", r.headers["X-Duration-Seconds"])`;

const NODE = `// Long scripts: queue a job, then poll it
const base = "http://localhost:3000";

const { jobId } = await fetch(base + "/api/tts/jobs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: script,
    voice: "bm_george",
    subtitles: true,
  }),
}).then((r) => r.json());

let job;
do {
  await new Promise((r) => setTimeout(r, 1500));
  job = await fetch(\`\${base}/api/jobs/\${jobId}\`).then((r) => r.json());
  console.log(job.stage, job.progress + "%");
} while (job.status === "running" || job.status === "queued");

// job.audioUrl and job.srtUrl are now ready to download`;

const ENDPOINTS: [string, string, string][] = [
  ["POST", "/api/tts/speak", "Generate, return audio"],
  ["POST", "/api/tts/jobs", "Queue a long script"],
  ["POST", "/api/tts/estimate", "Preview cost and duration"],
  ["GET", "/api/voices", "List every voice"],
  ["POST", "/api/voices/preview", "Sample a voice or blend"],
  ["GET", "/api/jobs/{id}", "Poll job status"],
  ["GET", "/api/jobs/{id}/audio", "Download the result"],
  ["GET", "/api/jobs/{id}/subtitles", "SRT or VTT"],
  ["POST", "/api/clone/upload", "Grade a reference clip"],
  ["POST", "/api/clone/enrol", "Create a cloned voice"],
];

const METHOD_COLOR: Record<string, string> = {
  GET: "var(--color-brand-2)",
  POST: "var(--color-ok)",
};

export default function AutomatePage() {
  return (
    <div className="fade-in">
      <header className="mb-8">
        <div className="page-kicker">Developer platform</div>
        <h1 className="page-title">Automate</h1>
        <p className="page-description">
          Drive VoiceGen from a script, a scheduler, n8n, or Make. One call in, audio out.
        </p>
      </header>

      <div className="alert alert-info mb-5">
        <Info size={17} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong className="mb-1 block">Your server address</strong>
          The examples below assume <code>http://localhost:3000</code>. Swap in your own
          host and port if you have changed them.
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <section className="card">
            <h2 className="mb-3.5 text-[1.05rem] font-semibold">Generate audio with curl</h2>
            <CodeBlock code={CURL} />
          </section>

          <section className="card">
            <h2 className="mb-3.5 text-[1.05rem] font-semibold">Python</h2>
            <CodeBlock code={PYTHON} />
          </section>

          <section className="card">
            <h2 className="mb-3.5 text-[1.05rem] font-semibold">Node / JavaScript</h2>
            <CodeBlock code={NODE} />
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="card">
            <h2 className="mb-3.5 text-[1.05rem] font-semibold">Endpoints</h2>
            {ENDPOINTS.map(([method, path, desc]) => (
              <div
                key={path + method}
                className="flex items-center gap-2.5 border-b py-2.5 text-[0.85rem] last:border-b-0"
                style={{ borderColor: "var(--color-line)" }}
              >
                <span
                  className="min-w-[48px] shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[0.7rem] font-bold"
                  style={{
                    background: `color-mix(in srgb, ${METHOD_COLOR[method]} 20%, transparent)`,
                    color: METHOD_COLOR[method],
                  }}
                >
                  {method}
                </span>
                <span className="font-mono text-[0.8rem]">{path}</span>
                <span
                  className="ml-auto hidden text-right text-[0.8rem] sm:block"
                  style={{ color: "var(--color-ink-dim)" }}
                >
                  {desc}
                </span>
              </div>
            ))}
          </section>

          <section className="card">
            <h2 className="mb-3.5 text-[1.05rem] font-semibold">The <code>voice</code> field</h2>
            <div className="scroll-x">
              <table className="w-full border-collapse text-[0.84rem]">
                <tbody>
                  {[
                    ['"af_heart"', "a built-in voice"],
                    ['"blend_hype"', "a built-in blend preset"],
                    ['"clone:vc_1a2b3c"', "one of your cloned or saved voices"],
                    ['[{"voice":"af_heart","weight":0.6}, …]', "an ad-hoc blend"],
                  ].map(([value, meaning]) => (
                    <tr key={value}>
                      <td className="border-b py-2 pr-3 font-mono text-[0.78rem]" style={{ borderColor: "var(--color-line)" }}>
                        {value}
                      </td>
                      <td className="border-b py-2" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-dim)" }}>
                        {meaning}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck size={18} style={{ color: "var(--color-brand)" }} />
              <h2 className="m-0 text-[1.05rem] font-semibold">Publishing responsibly</h2>
            </div>
            <p className="mb-2.5 text-[0.87rem]" style={{ color: "var(--color-ink-dim)" }}>
              Both models allow commercial use. What platforms care about is disclosure
              and consent:
            </p>
            <ul
              className="m-0 list-disc pl-5 text-[0.86rem] leading-relaxed"
              style={{ color: "var(--color-ink-dim)" }}
            >
              <li>YouTube asks you to tick <em>altered or synthetic content</em> when a video contains a realistic synthetic voice.</li>
              <li>Meta applies similar AI-content labelling on Facebook and Instagram.</li>
              <li>Only clone a voice you own or have written permission to use.</li>
              <li>Cloned output is tagged as synthetic in the <code>X-Provenance</code> response header.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
