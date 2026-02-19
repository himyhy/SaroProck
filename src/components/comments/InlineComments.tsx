import type React from "react";
import { useEffect, useState } from "react";

import type CommentsWrapper from "./CommentsWrapper";

interface Props {
  identifier: string;
  commentType: "blog" | "telegram";
}

type CommentsWrapperComponent = typeof CommentsWrapper;

// 首页等列表场景：先展示可点击入口（无 JS 时可跳转详情页），点击后再异步加载评论组件与数据
const InlineComments: React.FC<Props> = ({ identifier, commentType }) => {
  const [open, setOpen] = useState(false);
  const [CommentsComponent, setCommentsComponent] =
    useState<CommentsWrapperComponent | null>(null);

  useEffect(() => {
    if (!open || CommentsComponent) return;

    let cancelled = false;
    void import("./CommentsWrapper").then((module) => {
      if (!cancelled) {
        setCommentsComponent(() => module.default);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, CommentsComponent]);

  if (!open) {
    return (
      <div className="mt-2 flex justify-end">
        <a
          href={`/post/${identifier}#comments`}
          className="btn btn-xs btn-ghost gap-1 text-xs text-base-content/70"
          onClick={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
        >
          <i className="ri-chat-3-line" />
          查看评论 / 参与讨论
        </a>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {CommentsComponent ? (
        <CommentsComponent
          identifier={identifier}
          commentType={commentType}
          displayMode="compact"
        />
      ) : (
        <div className="text-xs text-base-content/60 py-2">评论加载中…</div>
      )}
    </div>
  );
};

export default InlineComments;
