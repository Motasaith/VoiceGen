import type { Metadata, Viewport } from "next";

import "./globals.css";
import { Nav } from "@/components/Nav";
import { ToastHost } from "@/components/Toast";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const TITLE = "VoiceGen Studio | Local AI Text to Speech & Voice Cloning";
const DESCRIPTION =
  "Turn any script into natural narration, or clone a voice from 15 seconds of audio. " +
  "Runs entirely on your own machine. No account, API keys, or per-character billing.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: TITLE,
    template: "%s | VoiceGen Studio",
  },
  description: DESCRIPTION,
  applicationName: "VoiceGen Studio",
  keywords: [
    "text to speech", "AI voice generator", "voice cloning", "free TTS",
    "Kokoro TTS", "local text to speech", "offline TTS", "YouTube voiceover",
    "AI narration", "open source voice cloning", "self-hosted TTS",
  ],
  authors: [{ name: "VoiceGen Studio" }],
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "VoiceGen Studio",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
  ],
  width: "device-width",
  initialScale: 1,
};

/** Structured data helps search engines describe the app properly. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "VoiceGen Studio",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Windows, macOS, Linux",
  description: DESCRIPTION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "37 built-in voices across 6 languages",
    "Voice blending to create new speakers",
    "Voice cloning from a short reference clip",
    "SRT and VTT subtitle export",
    "Broadcast loudness normalisation",
    "HTTP API for automation",
  ],
};

/** Applied before paint so the theme never flashes. */
const THEME_SCRIPT = `
try {
  var t = localStorage.getItem('vg-theme');
  if (t) document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎙️</text></svg>"
        />
      </head>
      <body>
        <Nav />
        <main className="app-main">{children}</main>
        <ToastHost />
      </body>
    </html>
  );
}
