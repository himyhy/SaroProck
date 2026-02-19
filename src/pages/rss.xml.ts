import rss from "@astrojs/rss";
import { marked } from "marked";
import { getAllPostsWithShortLinks } from "@/lib/blog";

export const prerender = true;

export async function GET(context: any) {
  // 动态获取当前请求的站点根路径，防止因配置中的 site 导致链接错误
  const siteUrl = context.site || new URL(context.url.origin);

  const posts = await getAllPostsWithShortLinks(siteUrl);

  function replacePath(content: string, siteUrl: string): string {
    return content.replace(/(src|href)="([^"]+)"/g, (match, attr, value) => {
      if (!/^https?:\/\/|^\/\//.test(value) && !value.startsWith("data:")) {
        try {
          return `${attr}="${new URL(value, siteUrl).toString()}"`;
        } catch {
          return match;
        }
      }
      return match;
    });
  }

  const items = await Promise.all(
    posts.map(async (post) => {
      const {
        data: { title, description, pubDate },
      } = post;

      const content = post.body
        ? replacePath(await marked.parse(post.body), siteUrl.toString())
        : "No content available.";

      return {
        title,
        description,
        link: post.shortLink || post.longUrl,
        guid: post.longUrl,
        content,
        pubDate: new Date(pubDate),
        customData: "<dc:creator><![CDATA[HY博客]]></dc:creator>",
      };
    }),
  );

  return rss({
    title: "HY博客",
    description: "一个孤独的地方，散落着一个人的人生碎片",
    site: siteUrl.toString(),
    items,
    stylesheet: "/rss.xsl",
    customData: `
      <language>zh-CN</language>
      <atom:link href="${new URL(context.url.pathname, siteUrl)}" rel="self" type="application/rss+xml" />
      <image>
        <url>${new URL("/favicon.png", siteUrl).toString()}</url>
        <title>HY博客</title>
        <link>${siteUrl}</link>
      </image>
    `,
    xmlns: {
      dc: "http://purl.org/dc/elements/1.1/",
      content: "http://purl.org/rss/1.0/modules/content/",
      atom: "http://www.w3.org/2005/Atom",
    },
  });
}
