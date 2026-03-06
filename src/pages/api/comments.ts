import type { APIContext } from "astro";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import md5 from "md5";
import { ObjectId } from "mongodb";
import { getAdminUser } from "@/lib/auth";
import {
  type Comment,
  getCollection,
  type TelegramComment,
  toObjectId,
} from "@/lib/mongodb.server";

const window = new JSDOM("").window;
const dompurify = DOMPurify(window as any);

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function logCommentsApiFailed(
  event: string,
  input: string,
  error: unknown,
): void {
  console.error(event, {
    error: safeErrorMessage(error),
    inputHash: md5(input),
  });
}

function normalizeIp(raw: string): string {
  const ip = raw.trim();
  if (!ip) return ip;

  const v4MappedPrefix = "::ffff:";
  const withoutMapped = ip.toLowerCase().startsWith(v4MappedPrefix)
    ? ip.slice(v4MappedPrefix.length)
    : ip;

  if (withoutMapped.includes(":")) {
    const parts = withoutMapped.split(":");
    if (parts.length === 2 && parts[0]?.includes(".")) {
      return parts[0];
    }
  }

  return withoutMapped;
}

function getClientIp(context: APIContext): string | null {
  const headers = context.request.headers;

  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("true-client-ip"),
    headers.get("x-real-ip"),
    headers
      .get("x-forwarded-for")
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean)[0],
    context.clientAddress,
  ].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );

  const first = candidates[0];
  return first ? normalizeIp(first) : null;
}

function getCollectionNames(commentType: unknown): {
  commentCollection: "comments" | "telegram_comments";
  likeCollection: "comment_likes" | "telegram_comment_likes";
  type: "blog" | "telegram";
  identifierField: "slug" | "postId";
} {
  const type = commentType === "telegram" ? "telegram" : "blog";
  return {
    type,
    identifierField: type === "telegram" ? "postId" : "slug",
    commentCollection: type === "telegram" ? "telegram_comments" : "comments",
    likeCollection:
      type === "telegram" ? "telegram_comment_likes" : "comment_likes",
  };
}

function parsePagination(url: URL): { page: number; limit: number } {
  const page = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") || "1", 10),
  );
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") || "20", 10)),
  );
  return { page, limit };
}

async function fetchAdminComments(params: {
  commentCollection: "comments" | "telegram_comments";
  commentType: string;
  page: number;
  limit: number;
}): Promise<{ comments: any[]; total: number; page: number; limit: number }> {
  const collection = await getCollection(params.commentCollection);

  const totalCount = await collection.countDocuments();
  const results = await collection
    .find({})
    .sort({ createdAt: -1 })
    .skip((params.page - 1) * params.limit)
    .limit(params.limit)
    .toArray();

  const comments = results.map((comment) => {
    const json: any = {
      ...comment,
      id: comment._id?.toString(),
    };
    json.identifier =
      ("slug" in comment ? comment.slug : (comment as any).postId) || "";
    json.commentType = params.commentType;
    return json;
  });

  return {
    comments,
    total: totalCount,
    page: params.page,
    limit: params.limit,
  };
}

async function fetchPublicComments(params: {
  identifier: string;
  commentCollection: "comments" | "telegram_comments";
  likeCollection: "comment_likes" | "telegram_comment_likes";
  identifierField: "slug" | "postId";
  deviceId: string | null;
}): Promise<any[]> {
  const commentCollection = await getCollection(params.commentCollection);
  const likeCollection = await getCollection(params.likeCollection);

  const results = await commentCollection
    .find({ [params.identifierField]: params.identifier })
    .sort({ createdAt: 1 })
    .toArray();

  const commentIds = results
    .map((comment) => comment._id?.toString())
    .filter(Boolean) as string[];

  if (commentIds.length === 0) {
    return [];
  }

  const objectIds = commentIds
    .map((id) => {
      try {
        return toObjectId(id);
      } catch {
        return null;
      }
    })
    .filter(Boolean) as ObjectId[];

  const likes = await likeCollection
    .find({ comment: { $in: objectIds } })
    .toArray();

  const likeCounts = new Map<string, number>();
  likes.forEach((like) => {
    if (!like.comment) return;
    const commentId =
      like.comment instanceof ObjectId
        ? like.comment.toString()
        : (like.comment as string);
    likeCounts.set(commentId, (likeCounts.get(commentId) || 0) + 1);
  });

  const userLikedSet = new Set<string>();
  if (params.deviceId) {
    likes.forEach((like) => {
      if (!like || !like.comment) return;
      const isDeviceLike = "ip" in like && like.ip === params.deviceId;
      if (!isDeviceLike) return;
      const commentId =
        like.comment instanceof ObjectId
          ? like.comment.toString()
          : (like.comment as string);
      userLikedSet.add(commentId);
    });
  }

  return results.map((comment) => {
    const commentId = comment._id?.toString() || "";
    let parentId: string | undefined;
    if (comment.parent) {
      if (comment.parent instanceof ObjectId) {
        parentId = comment.parent.toString();
      } else if (typeof comment.parent === "string") {
        parentId = comment.parent;
      }
    }

    return {
      ...comment,
      id: commentId,
      parentId,
      likes: likeCounts.get(commentId) || 0,
      isLiked: userLikedSet.has(commentId),
    };
  });
}

async function createComment(params: {
  identifier: string;
  commentCollection: "comments" | "telegram_comments";
  identifierField: "slug" | "postId";
  content: string;
  parentId?: string | null;
  finalUser: {
    nickname: string;
    email: string;
    website?: string | null;
    avatar: string;
    isAdmin: boolean;
  };
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<any> {
  const collection = await getCollection(params.commentCollection);

  const rawHtml = await marked(params.content);
  const cleanHtml = dompurify.sanitize(rawHtml);

  const commentData: Partial<Comment | TelegramComment> = {
    [params.identifierField]: params.identifier,
    content: cleanHtml,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  (commentData as any).nickname = params.finalUser.nickname;
  (commentData as any).email = params.finalUser.email;
  (commentData as any).isAdmin = params.finalUser.isAdmin;
  (commentData as any).avatar = params.finalUser.avatar;
  if (params.finalUser.website) {
    (commentData as any).website = params.finalUser.website;
  }

  if (params.ipAddress) {
    (commentData as any).ip = params.ipAddress;
  }

  if (params.userAgent) {
    (commentData as any).ua = params.userAgent;
  }

  if (params.commentCollection === "telegram_comments") {
    (commentData as Partial<TelegramComment>).username =
      params.finalUser.nickname;
  }

  if (params.parentId) {
    try {
      commentData.parent = toObjectId(params.parentId);
    } catch {
      commentData.parent = params.parentId;
    }
  } else {
    commentData.parent = null;
  }

  const result = await collection.insertOne(commentData as any);
  return {
    id: result.insertedId.toString(),
    ...commentData,
  };
}

export async function GET(context: APIContext): Promise<Response> {
  const { request } = context;
  const url = new URL(request.url);
  const identifier = url.searchParams.get("identifier");
  const commentType = url.searchParams.get("commentType") || "blog";
  const deviceId = url.searchParams.get("deviceId");
  const { page, limit } = parsePagination(url);
  const { commentCollection, likeCollection, identifierField } =
    getCollectionNames(commentType);

  if (!identifier) {
    const adminUser = getAdminUser(context);
    if (!adminUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Admin access required." }),
        { status: 403 },
      );
    }

    try {
      const result = await fetchAdminComments({
        commentCollection,
        commentType,
        page,
        limit,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      logCommentsApiFailed("comments_api_admin_get_failed", request.url, error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch all comments" }),
        { status: 500 },
      );
    }
  }

  try {
    const comments = await fetchPublicComments({
      identifier,
      commentCollection,
      likeCollection,
      identifierField,
      deviceId,
    });

    return new Response(JSON.stringify(comments), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logCommentsApiFailed("comments_api_public_get_failed", request.url, error);
    return new Response(JSON.stringify({ error: "Failed to fetch comments" }), {
      status: 500,
    });
  }
}

export async function POST(context: APIContext): Promise<Response> {
  const { request } = context;
  try {
    const data = await request.json();
    const { identifier, commentType, content, parentId, userInfo } = data;

    const { commentCollection, identifierField } =
      getCollectionNames(commentType);

    if (!identifier || !content) {
      return new Response(
        JSON.stringify({ success: false, message: "缺少必要参数" }),
        { status: 400 },
      );
    }

    const adminUser = getAdminUser(context);

    let finalUser: {
      nickname: string;
      email: string;
      website?: string | null;
      avatar: string;
      isAdmin: boolean;
    };

    if (adminUser) {
      finalUser = {
        nickname: adminUser.nickname || "博主",
        email: adminUser.email || "",
        website: adminUser.website || "",
        avatar: adminUser.avatar || "",
        isAdmin: true,
      };
    } else {
      if (!userInfo || !userInfo.nickname || !userInfo.email) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "普通用户需要提供用户信息",
          }),
          { status: 400 },
        );
      }
      finalUser = {
        nickname: userInfo.nickname,
        email: userInfo.email,
        website: userInfo.website || null,
        avatar: userInfo.avatar,
        isAdmin: false,
      };
    }

    const ipAddress = getClientIp(context);
    const userAgent = context.request.headers.get("user-agent");

    const savedComment = await createComment({
      identifier,
      commentCollection,
      identifierField,
      content,
      parentId,
      finalUser,
      ipAddress,
      userAgent,
    });

    return new Response(
      JSON.stringify({ success: true, comment: savedComment }),
      { status: 201 },
    );
  } catch (error) {
    logCommentsApiFailed("comments_api_post_failed", request.url, error);
    return new Response(
      JSON.stringify({ success: false, message: "服务器内部错误" }),
      { status: 500 },
    );
  }
}

export async function DELETE(context: APIContext): Promise<Response> {
  const adminUser = getAdminUser(context);
  if (!adminUser) {
    return new Response(
      JSON.stringify({ success: false, message: "Unauthorized" }),
      { status: 403 },
    );
  }

  try {
    const { commentId, commentType } = await context.request.json();
    if (!commentId || !commentType) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Missing commentId or commentType",
        }),
        { status: 400 },
      );
    }

    const { commentCollection, likeCollection } =
      getCollectionNames(commentType);
    const commentColl = await getCollection(commentCollection);
    const likeColl = await getCollection(likeCollection);

    const allCommentIds: ObjectId[] = [];
    const queue: ObjectId[] = [];

    const mainCommentIdObj = toObjectId(commentId);
    allCommentIds.push(mainCommentIdObj);
    queue.push(mainCommentIdObj);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = await commentColl
        .find({ parent: currentId })
        .project({ _id: 1 })
        .toArray();

      for (const child of children) {
        if (child._id && child._id instanceof ObjectId) {
          if (!allCommentIds.some((id) => id.equals(child._id as ObjectId))) {
            allCommentIds.push(child._id as ObjectId);
            queue.push(child._id as ObjectId);
          }
        }
      }
    }

    if (allCommentIds.length > 0) {
      await commentColl.deleteMany({
        _id: { $in: allCommentIds },
      });
    }

    await likeColl.deleteMany({
      comment: { $in: allCommentIds },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Deleted ${allCommentIds.length} comment(s) and their likes.`,
      }),
      { status: 200 },
    );
  } catch (error: any) {
    logCommentsApiFailed(
      "comments_api_delete_failed",
      context.request.url,
      error,
    );
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message || "Server internal error",
      }),
      { status: 500 },
    );
  }
}
