import { type CollectionEntry, getCollection } from "astro:content";
import type { APIContext } from "astro";
import { ObjectId } from "mongodb";
import { getAdminUser } from "@/lib/auth";
import { getCollection as getMongoCollection } from "@/lib/mongodb.server";

export async function GET(context: APIContext): Promise<Response> {
  const adminUser = getAdminUser(context);
  if (!adminUser) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
    });
  }

  try {
    const blogEntries = await getCollection(
      "blog",
      ({ data }: CollectionEntry<"blog">) => !data.draft,
    );
    const blogSlugs = blogEntries.map(
      (entry: CollectionEntry<"blog">) => entry.slug,
    );

    const blogComments = await getMongoCollection("comments").then((c) =>
      c.find({}).limit(10000).toArray(),
    );
    const telegramComments = await getMongoCollection("telegram_comments").then(
      (c) => c.find({}).limit(10000).toArray(),
    );
    const postLikes = await getMongoCollection("post_likes").then((c) =>
      c.find({}).limit(1000).toArray(),
    );
    const postViews = await getMongoCollection("post_views").then((c) =>
      c.find({}).limit(10000).toArray(),
    );
    const blogCommentLikes = await getMongoCollection("comment_likes").then(
      (c) => c.find({}).limit(10000).toArray(),
    );
    const telegramCommentLikes = await getMongoCollection(
      "telegram_comment_likes",
    ).then((c) => c.find({}).limit(10000).toArray());

    const commentCounts = new Map<string, number>();
    blogComments.forEach((comment) => {
      if (!comment) return;
      const slug = "slug" in comment ? comment.slug : "";
      if (slug) {
        commentCounts.set(slug, (commentCounts.get(slug) || 0) + 1);
      }
    });

    const telegramCommentCounts = new Map<string, number>();
    telegramComments.forEach((comment) => {
      if (!comment) return;
      const postId = "postId" in comment ? comment.postId : "";
      if (postId) {
        telegramCommentCounts.set(
          postId as string,
          (telegramCommentCounts.get(postId as string) || 0) + 1,
        );
      }
    });

    const postLikeCounts = new Map<string, number>();
    postLikes.forEach((like) => {
      if (!like) return;
      const postId = like.postId;
      const likes = like.likes || 0;
      if (postId) {
        postLikeCounts.set(postId, likes);
      }
    });

    const postViewCounts = new Map<string, number>();
    postViews.forEach((item) => {
      if (!item) return;
      const postId = item.slug as string | undefined;
      const views = (item.views as number) || 0;
      if (postId) {
        postViewCounts.set(postId, views);
      }
    });

    const blogCommentToSlug = new Map<string, string>();
    blogComments.forEach((comment) => {
      const commentId = comment._id?.toString();
      const slug = "slug" in comment ? comment.slug : "";
      if (commentId && slug) {
        blogCommentToSlug.set(commentId, slug);
      }
    });

    const telegramCommentToPostId = new Map<string, string>();
    telegramComments.forEach((comment) => {
      const commentId = comment._id?.toString();
      const postId = "postId" in comment ? comment.postId : "";
      if (commentId && postId) {
        telegramCommentToPostId.set(commentId, postId as string);
      }
    });

    const commentLikeCountsByPost = new Map<string, number>();
    blogCommentLikes.forEach((like) => {
      if (!like || !like.comment) return;
      const commentId =
        like.comment instanceof ObjectId
          ? like.comment.toString()
          : (like.comment as string);
      const slug = blogCommentToSlug.get(commentId);
      if (slug) {
        commentLikeCountsByPost.set(
          slug,
          (commentLikeCountsByPost.get(slug) || 0) + 1,
        );
      }
    });

    telegramCommentLikes.forEach((like) => {
      if (!like || !like.comment) return;
      const commentId =
        like.comment instanceof ObjectId
          ? like.comment.toString()
          : (like.comment as string);
      const postId = telegramCommentToPostId.get(commentId);
      if (postId) {
        commentLikeCountsByPost.set(
          postId,
          (commentLikeCountsByPost.get(postId) || 0) + 1,
        );
      }
    });

    const blogStats = blogSlugs.map((slug: string) => {
      const entry = blogEntries.find(
        (blogEntry: CollectionEntry<"blog">) => blogEntry.slug === slug,
      );
      return {
        identifier: slug,
        type: "blog" as const,
        title: entry?.data.title || slug,
        comments: commentCounts.get(slug) || 0,
        likes: postLikeCounts.get(slug) || 0,
        commentLikes: commentLikeCountsByPost.get(slug) || 0,
        totalLikes:
          (postLikeCounts.get(slug) || 0) +
          (commentLikeCountsByPost.get(slug) || 0),
        views: postViewCounts.get(slug) || 0,
      };
    });

    const telegramPostIds = Array.from(
      new Set(
        telegramComments
          .map((comment) => ("postId" in comment ? comment.postId : undefined))
          .filter(Boolean) as string[],
      ),
    );

    const telegramStats = telegramPostIds.map((postId) => ({
      identifier: postId,
      type: "telegram" as const,
      title: postId,
      comments: telegramCommentCounts.get(postId) || 0,
      likes: postLikeCounts.get(postId) || 0,
      commentLikes: commentLikeCountsByPost.get(postId) || 0,
      totalLikes:
        (postLikeCounts.get(postId) || 0) +
        (commentLikeCountsByPost.get(postId) || 0),
      views: postViewCounts.get(postId) || 0,
    }));

    const allStats = [...blogStats, ...telegramStats].sort((a, b) => {
      const aTotal = a.comments + a.totalLikes;
      const bTotal = b.comments + b.totalLikes;
      return bTotal - aTotal;
    });

    return new Response(JSON.stringify({ data: allStats }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching posts stats:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch posts statistics" }),
      { status: 500 },
    );
  }
}
