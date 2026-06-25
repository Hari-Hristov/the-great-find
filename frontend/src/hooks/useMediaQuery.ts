import { useSyncExternalStore } from "react";

/**
 * Track a CSS media query as a boolean using `useSyncExternalStore` so React
 * doesn't see a setState-in-effect pattern. Returns `false` on the server.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    () => (typeof window === "undefined" ? false : window.matchMedia(query).matches),
    () => false,
  );
}
