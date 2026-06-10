import { useEffect, useState } from "react";
import { getGPUTier } from "detect-gpu";

export function useCanRender3D(): boolean {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const small = window.matchMedia("(max-width: 768px)").matches;
    if (small) return;

    let cancelled = false;
    getGPUTier()
      .then((t) => {
        if (cancelled) return;
        setOk((t.tier ?? 0) >= 2);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return ok;
}
