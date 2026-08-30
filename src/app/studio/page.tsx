import type { Metadata } from "next";

import { StudioClient } from "./StudioClient";

export const metadata: Metadata = {
  title: "Studio",
  description:
    "Paste a script, choose a voice, and generate natural narration. Long scripts are " +
    "split automatically and stitched back together with natural pauses.",
  alternates: { canonical: "/studio" },
};

export default function StudioPage() {
  return <StudioClient />;
}
