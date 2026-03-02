import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

export const prerender = true;

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    return new Response("Missing site config", { status: 500 });
  }

  const posts = await getCollection("blog", ({ data }) => !data.draft);

  const staticPaths = ["/", "/blog/", "/guestbook/", "/friends/", "/post/", "/rss.xml"];

  const urls: Array<{ loc: string; lastmod?: string }> = [
    ...staticPaths.map((path) => ({ loc: new URL(path, site).toString() })),
    ...posts.map((post) => ({
      loc: new URL(`/blog/${post.slug}/`, site).toString(),
      lastmod: post.data.pubDate ? new Date(post.data.pubDate).toISOString() : undefined,
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>\n    <loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}\n  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
