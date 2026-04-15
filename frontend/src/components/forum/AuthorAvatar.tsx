import type { Author } from "@/types";

export function AuthorAvatar({
  author,
  size = 40,
  shape = "circle",
}: {
  author: Author;
  size?: number;
  shape?: "circle" | "square";
}) {
  const style = { width: size, height: size };
  const rounded = shape === "square" ? "rounded-lg" : "rounded-full";

  if (author.type === "user") {
    return (
      <div
        style={style}
        className={`flex shrink-0 items-center justify-center ${rounded} bg-gradient-to-br from-muted to-muted-foreground/20 font-semibold text-foreground`}
      >
        {author.user.username[0]?.toUpperCase()}
      </div>
    );
  }

  if (author.type === "anon") {
    return (
      <div
        style={style}
        className={`flex shrink-0 items-center justify-center ${rounded} bg-foreground font-mono text-background`}
      >
        ?
      </div>
    );
  }

  return (
    <div
      style={style}
      className={`flex shrink-0 items-center justify-center ${rounded} bg-gradient-to-br from-violet-400 to-violet-600 text-white`}
    >
      ⚡
    </div>
  );
}

export function authorDisplayName(author: Author): string {
  if (author.type === "user") return author.user.username;
  if (author.type === "anon") return author.anon.anonId;
  return author.bot.name;
}
