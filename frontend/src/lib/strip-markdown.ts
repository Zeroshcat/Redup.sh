/**
 * Cheaply strip common Markdown syntax so a snippet can be shown as plain text
 * in notifications, search previews, etc. Not a full parser — just visual cleanup.
 */
export function stripMarkdown(input: string): string {
  return input
    // Fenced code blocks ``` ... ```
    .replace(/```[\s\S]*?```/g, " ")
    // Inline code `foo`
    .replace(/`([^`]+)`/g, "$1")
    // Images ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Headings # ## ###
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    // Blockquotes >
    .replace(/^\s{0,3}>\s?/gm, "")
    // List markers - * +
    .replace(/^\s*[-*+]\s+/gm, "")
    // Ordered list markers 1.
    .replace(/^\s*\d+\.\s+/gm, "")
    // Bold / italic / strike **x** *x* ~~x~~
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    // Horizontal rules
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}
