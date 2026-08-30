import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The API and a user's own generated files should never be indexed.
      disallow: ["/api/", "/library"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
