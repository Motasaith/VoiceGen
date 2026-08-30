import type { Metadata } from "next";

import { CATALOG, LANGUAGE_SUMMARY } from "@/lib/catalog";
import { VoicesClient } from "./VoicesClient";

export const metadata: Metadata = {
  title: "Voices",
  description:
    `Browse all ${CATALOG.length} built-in AI voices across ${LANGUAGE_SUMMARY.length} languages, ` +
    "preview each one, and blend any two into a brand new speaker.",
  alternates: { canonical: "/voices" },
};

export default function VoicesPage() {
  return <VoicesClient />;
}
