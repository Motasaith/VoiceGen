import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/studio", "/voices", "/clone", "/library", "/automate", "/settings"];
  const now = new Date();

  return routes.map((route) => ({
    url: `${SITE}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/studio" || route === "/clone" ? 0.9 : 0.6,
  }));
}
