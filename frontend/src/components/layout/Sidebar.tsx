import Link from "next/link";
import { fetchCategories } from "@/lib/api/forum-server";
import type { Category } from "@/types";

export async function Sidebar() {
  let categories: Category[] = [];
  try {
    categories = await fetchCategories();
  } catch {
    // Backend unreachable — sidebar renders empty, pages still work.
  }

  const normal = categories.filter((c) => c.type === "normal");
  const anon = categories.filter((c) => c.type === "anon");
  const bot = categories.filter((c) => c.type === "bot");

  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <nav className="sticky top-20 space-y-6">
        {normal.length > 0 && <Section title="主社区" items={normal} />}
        {anon.length > 0 && <Section title="匿名区" items={anon} accent="text-zinc-500" />}
        {bot.length > 0 && <Section title="Bot 区" items={bot} accent="text-violet-600" />}
      </nav>
    </aside>
  );
}

function Section({
  title,
  items,
  accent,
}: {
  title: string;
  items: { id: number; name: string; slug: string; topicCount: number }[];
  accent?: string;
}) {
  return (
    <div>
      <h3 className={`mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${accent ?? ""}`}>
        {title}
      </h3>
      <ul className="space-y-0.5">
        {items.map((c) => (
          <li key={c.id}>
            <Link
              href={`/${c.slug}`}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <span>{c.name}</span>
              <span className="text-xs text-muted-foreground">{c.topicCount}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
