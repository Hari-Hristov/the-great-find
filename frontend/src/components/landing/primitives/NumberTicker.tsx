import { useEffect, useRef } from "react";
import { useSpring, animated } from "@react-spring/web";

interface NumberTickerProps {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
  startOnView?: boolean;
}

export function NumberTicker({
  value,
  duration = 1600,
  format = (n) => Math.round(n).toLocaleString(),
  className,
  startOnView = true,
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [spring, api] = useSpring(() => ({
    n: 0,
    config: { duration },
  }));

  useEffect(() => {
    if (!startOnView) {
      api.start({ n: value });
      return;
    }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            api.start({ n: value });
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [value, startOnView, api]);

  return (
    <animated.span ref={ref} className={className}>
      {spring.n.to((n) => format(n))}
    </animated.span>
  );
}
