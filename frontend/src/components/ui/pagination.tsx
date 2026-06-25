import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// pageWindow returns the slot list to render: numbers and "ellipsis" markers.
// Always shows first + last; up to 3 around the current page; ellipsis fills
// any gap > 1. Caps total visible slots so the bar never wraps.
const MAX_VISIBLE_SLOTS = 7;

function pageWindow(page: number, total: number): (number | "ellipsis")[] {
  if (total <= MAX_VISIBLE_SLOTS) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const slots: (number | "ellipsis")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) slots.push("ellipsis");
  for (let p = start; p <= end; p++) slots.push(p);
  if (end < total - 1) slots.push("ellipsis");
  slots.push(total);
  return slots;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  const slots = pageWindow(page, totalPages);

  return (
    <nav className="mt-3 flex items-center justify-center gap-1" aria-label="Pagination">
      <PageButton
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </PageButton>

      {slots.map((s, i) =>
        s === "ellipsis" ? (
          <span
            key={`e${i}`}
            className="px-2 text-xs text-[var(--color-text-muted)]"
          >
            …
          </span>
        ) : (
          <PageButton
            key={s}
            onClick={() => onPageChange(s)}
            active={s === page}
            aria-label={`Page ${s}`}
            aria-current={s === page ? "page" : undefined}
          >
            {s}
          </PageButton>
        ),
      )}

      <PageButton
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </PageButton>
    </nav>
  );
}

interface PageButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

function PageButton({ active, className, children, ...props }: PageButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-xs tabular-nums transition-colors",
        active
          ? "bg-[var(--color-accent)] text-[var(--color-bg-base)]"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
