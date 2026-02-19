// src/components/feed/LikeButton.tsx
import type React from "react";
import { useEffect, useState } from "react";

interface Props {
  postId: string;
}

const LikeButton: React.FC<Props> = ({ postId }) => {
  const [likeCount, setLikeCount] = useState<number>(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const storageKey = "liked_feed_posts";

  const formatLargeCount = (count: number) => {
    if (count < 1000) return count.toString();
    const k = count / 1000;
    if (k < 10) return `${k.toFixed(1)}k`;
    return `${Math.floor(k)}k`;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const likedPosts = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(likedPosts) && likedPosts.includes(postId)) {
        setHasLiked(true);
      }
    } catch (error) {
      console.error("Failed to restore like state from localStorage", error);
    }
  }, [postId]);

  const handleClick = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    const newLikedState = !hasLiked;

    setHasLiked(newLikedState);
    setLikeCount((prev) => (newLikedState ? prev + 1 : Math.max(0, prev - 1)));

    const likedPosts = new Set<string>(
      JSON.parse(localStorage.getItem(storageKey) || "[]"),
    );
    if (newLikedState) likedPosts.add(postId);
    else likedPosts.delete(postId);
    localStorage.setItem(storageKey, JSON.stringify(Array.from(likedPosts)));

    try {
      const response = await fetch("/api/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, delta: newLikedState ? 1 : -1 }),
      });

      if (!response.ok) throw new Error("API request failed");

      const data = await response.json();
      if (data.success) setLikeCount(data.likeCount);
    } catch (error) {
      console.error("Failed to submit like:", error);
      setHasLiked(!newLikedState);
      setLikeCount((prev) => (newLikedState ? prev - 1 : prev + 1));
    } finally {
      setIsSubmitting(false);
    }
  };

  const classes = `btn btn-ghost btn-xs rounded-lg gap-1 text-base-content/60 ${hasLiked ? "text-error" : ""}`;

  return (
    <a
      href={`/post/${postId}`}
      className={classes}
      onClick={handleClick}
      aria-busy={isSubmitting}
      aria-disabled={isSubmitting}
    >
      {isSubmitting ? (
        <span className="loading loading-spinner loading-xs" />
      ) : (
        <i
          className={`${hasLiked ? "ri-heart-fill" : "ri-heart-line"} text-lg`}
        />
      )}
      <span>{hasLiked ? "已赞" : "点赞"}</span>
      {likeCount > 0 &&
        (likeCount < 1000 ? (
          <span className="opacity-70 countdown font-mono">
            <span style={{ "--value": likeCount } as React.CSSProperties}>
              {likeCount}
            </span>
          </span>
        ) : (
          <span className="opacity-70">· {formatLargeCount(likeCount)}</span>
        ))}
    </a>
  );
};

export default LikeButton;
