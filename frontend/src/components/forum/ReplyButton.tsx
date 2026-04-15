"use client";

export type ReplyTarget = { floor: number; authorName: string };

export function ReplyButton({ target }: { target?: ReplyTarget }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (target) {
          window.dispatchEvent(
            new CustomEvent<ReplyTarget>("redup:reply-to", { detail: target }),
          );
        } else {
          window.dispatchEvent(new CustomEvent("redup:reply-to", { detail: null }));
        }
        const el = document.getElementById("reply-composer");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      💬 回复
    </button>
  );
}
