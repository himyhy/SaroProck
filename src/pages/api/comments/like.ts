import type { APIContext } from "astro";
import type { ObjectId } from "mongodb";
import { getCollection, toObjectId } from "@/lib/mongodb.server";

export async function POST({ request }: APIContext): Promise<Response> {
  try {
    const { commentId, commentType, deviceId } = await request.json();

    if (!commentId || !deviceId || !commentType) {
      return new Response(
        JSON.stringify({ success: false, message: "缺少必要参数" }),
        { status: 400 },
      );
    }

    const likeCollection =
      commentType === "telegram" ? "telegram_comment_likes" : "comment_likes";
    const likeColl = await getCollection(likeCollection);

    let commentObjectId: ObjectId;
    try {
      commentObjectId = toObjectId(commentId);
    } catch {
      return new Response(
        JSON.stringify({ success: false, message: "无效的 commentId" }),
        { status: 400 },
      );
    }

    const existingLike = await likeColl.findOne({
      comment: commentObjectId,
      ip: deviceId,
    });

    if (existingLike) {
      await likeColl.deleteOne({ _id: existingLike._id });
    } else {
      const now = new Date();
      await likeColl.insertOne({
        comment: commentObjectId,
        ip: deviceId,
        createdAt: now,
        updatedAt: now,
      });
    }

    const totalLikes = await likeColl.countDocuments({
      comment: commentObjectId,
    });

    return new Response(
      JSON.stringify({
        success: true,
        likes: totalLikes,
        isLiked: !existingLike,
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("Error processing like:", error);
    return new Response(
      JSON.stringify({ success: false, message: "服务器内部错误" }),
      { status: 500 },
    );
  }
}
