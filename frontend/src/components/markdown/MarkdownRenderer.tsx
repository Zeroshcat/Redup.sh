import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import Link from "next/link";
import "./markdown-highlight.css";

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className"]],
    span: [...(defaultSchema.attributes?.span ?? []), ["className"]],
  },
};

const MENTION_REGEX = /(@[A-Za-z][A-Za-z0-9_-]*)/g;

function renderMentions(text: string): React.ReactNode[] {
  const parts = text.split(MENTION_REGEX);
  return parts.map((part, i) => {
    if (MENTION_REGEX.test(part)) {
      MENTION_REGEX.lastIndex = 0;
      const name = part.slice(1);
      return (
        <Link
          key={i}
          href={`/bot/${name.toLowerCase()}`}
          className="rounded bg-violet-100 px-1 font-medium text-violet-700 hover:bg-violet-200"
        >
          @{name}
        </Link>
      );
    }
    return part;
  });
}

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="redup-md text-[15px] leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema], rehypeHighlight]}
        components={{
          p: ({ children }) => (
            <p className="my-3 first:mt-0 last:mb-0">
              {Array.isArray(children)
                ? children.map((c, i) =>
                    typeof c === "string" ? <span key={i}>{renderMentions(c)}</span> : c,
                  )
                : typeof children === "string"
                ? renderMentions(children)
                : children}
            </p>
          ),
          h1: ({ children }) => (
            <h1 className="mb-3 mt-6 border-b border-border pb-2 text-2xl font-bold first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-5 text-xl font-bold first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h3>
          ),
          ul: ({ children }) => <ul className="my-3 ml-5 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 ml-5 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-4 border-border bg-muted/60 px-4 py-2 text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className?.startsWith("language-");
            if (isInline) {
              return (
                <code
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={`${className} font-mono text-[13px]`} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-4 overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 text-[13px] leading-relaxed">
              {children}
            </pre>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="w-full border-collapse border border-border text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted/60 px-3 py-1.5 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-1.5">{children}</td>
          ),
          hr: () => <hr className="my-6 border-border" />,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
