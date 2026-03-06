import type { APIContext } from "astro";
import { getAdminUser } from "@/lib/auth";
import { getCollection } from "@/lib/mongodb.server";

export async function GET(context: APIContext): Promise<Response> {
  const adminUser = getAdminUser(context);
  if (!adminUser) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
    });
  }

  const sinkBaseUrl = import.meta.env.SINK_PUBLIC_URL;
  const sinkApiKey = import.meta.env.SINK_API_KEY;

  try {
    const [
      totalBlogComments,
      totalTelegramComments,
      allPostLikes,
      totalBlogCommentLikes,
      totalTelegramCommentLikes,
      sinkCountersResponse,
    ] = await Promise.all([
      getCollection("comments").then((c) => c.countDocuments()),
      getCollection("telegram_comments").then((c) => c.countDocuments()),
      getCollection("post_likes").then((c) => c.find({}).toArray()),
      getCollection("comment_likes").then((c) => c.countDocuments()),
      getCollection("telegram_comment_likes").then((c) => c.countDocuments()),
      sinkApiKey && sinkBaseUrl
        ? fetch(`${sinkBaseUrl}/api/stats/counters`, {
            headers: { Authorization: `Bearer ${sinkApiKey}` },
          })
        : Promise.resolve(null),
    ]);

    const totalPostLikes = allPostLikes.reduce(
      (sum, item) => sum + (item.likes || 0),
      0,
    );

    let totalSinkViews = 0;
    if (sinkCountersResponse?.ok) {
      const countersData = await sinkCountersResponse.json();
      if (countersData.data?.[0]) {
        totalSinkViews = countersData.data[0].visits || 0;
      }
    }

    const stats = {
      comments: {
        blog: totalBlogComments,
        telegram: totalTelegramComments,
        total: totalBlogComments + totalTelegramComments,
      },
      likes: {
        posts: totalPostLikes,
        comments: totalBlogCommentLikes + totalTelegramCommentLikes,
        total:
          totalPostLikes + totalBlogCommentLikes + totalTelegramCommentLikes,
      },
      sink: {
        totalViews: totalSinkViews,
      },
    };

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch statistics" }),
      { status: 500 },
    );
  }
}
