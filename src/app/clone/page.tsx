import type { Metadata } from "next";

import { CloneClient } from "./CloneClient";

export const metadata: Metadata = {
  title: "Voice Cloning",
  description:
    "Clone a voice from 10–20 seconds of audio, entirely on your own machine. " +
    "The reference clip is graded before you commit so you know exactly what to fix.",
  alternates: { canonical: "/clone" },
};

export default function ClonePage() {
  return <CloneClient />;
}
