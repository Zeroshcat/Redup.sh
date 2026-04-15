import { cn } from "@/lib/utils";

// Inline spinner for buttons and small loading states. Uses currentColor
// so it inherits whatever text color the parent is painting with, which
// means one component works on primary, muted, destructive, etc. without
// any variants to maintain.
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="loading"
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}
