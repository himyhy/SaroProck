import type { APIRoute } from "astro";

export const prerender = true;

function getRobotsTxt(sitemapURL: URL) {
  return `User-agent: *
Allow: /

Sitemap: ${sitemapURL.href}
`;
}

export const GET: APIRoute = ({ site }) => {
  if (!site) {
    return new Response("Missing site config", { status: 500 });
  }

  const sitemapURL = new URL("sitemap.xml", site);
  return new Response(getRobotsTxt(sitemapURL), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
