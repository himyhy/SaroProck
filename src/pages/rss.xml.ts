import rss from "@astrojs/rss";
import { marked } from "marked";
import { getAllPostsWithShortLinks } from "@/lib/blog";

export const prerender = true;

function getRequestOrigin(context: any): string {
  const headers = context?.request?.headers;
  const xfHost = headers?.get?.("x-forwarded-host");
  const xfProto = headers?.get?.("x-forwarded-proto");

  if (xfHost) {
    const proto = xfProto || "https";
    return `${proto}://${xfHost}`;
  }

  return context.url.origin;
}

export async function GET(context: any) {
  // 在 Vercel/反代环境下，context.url.origin 可能不是用户访问的域名；优先使用 x-forwarded-* 还原真实 origin
  // 这样在镜像域名/多域名访问 rss.xml 时，点开文章仍留在当前域名
  const siteUrl = new URL(getRequestOrigin(context));

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
        // RSS 阅读器/浏览器 XSLT 里点击文章时应跳转到站点正文页；这里使用当前请求域名生成的绝对链接
        link: post.longUrl,
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
