import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Trap keyboard focus inside the element returned from `ref` while `active`
 * is true. On activation, focus moves to the first focusable child (or the
 * element itself if it's `tabindex`'d). On deactivation, focus returns to
 * whatever element was focused immediately before activation. Esc invokes
 * `onEscape` if provided.
 *
 * Pair with `role="dialog"` + `aria-modal="true"` for proper modal semantics.
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  onEscape?: () => void,
) {
  const ref = useRef<T | null>(null);
  // Element that had focus before the trap engaged — restored on unmount.
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    restoreRef.current = (document.activeElement as HTMLElement | null) ?? null;

    const focusables = (): HTMLElement[] =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("inert") && el.offsetParent !== null,
      );

    const initial = focusables()[0] ?? node;
    initial.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onEscape) {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (f.length === 0) {
        e.preventDefault();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Restore focus to the previously-focused element when the trap releases,
      // unless that element has since left the DOM (e.g. unmounted route).
      const r = restoreRef.current;
      if (r && document.contains(r)) r.focus();
    };
  }, [active, onEscape]);

  return ref;
}
