import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

interface BeamNode {
  id: string;
  label: string;
  sub?: string;
}

interface AnimatedBeamProps {
  nodes: BeamNode[];
  className?: string;
}

export function AnimatedBeam({ nodes, className }: AnimatedBeamProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [paths, setPaths] = useState<string[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const wrap = wrapperRef.current;
    if (!wrap) return;

    const compute = () => {
      const wrapRect = wrap.getBoundingClientRect();
      setSize({ w: wrapRect.width, h: wrapRect.height });
      const next: string[] = [];
      for (let i = 0; i < nodeRefs.current.length - 1; i++) {
        const a = nodeRefs.current[i];
        const b = nodeRefs.current[i + 1];
        if (!a || !b) continue;
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const ax = ar.left + ar.width / 2 - wrapRect.left;
        const ay = ar.top + ar.height / 2 - wrapRect.top;
        const bx = br.left + br.width / 2 - wrapRect.left;
        const by = br.top + br.height / 2 - wrapRect.top;
        const cx = (ax + bx) / 2;
        next.push(`M ${ax} ${ay} Q ${cx} ${ay} ${cx} ${(ay + by) / 2} T ${bx} ${by}`);
      }
      setPaths(next);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(wrap);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [nodes.length]);

  useEffect(() => {
    if (paths.length === 0) return;
    const wrap = wrapperRef.current;
    if (!wrap) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: wrap, start: "top 70%", once: true },
      });

      pathRefs.current.forEach((p) => {
        if (!p) return;
        const len = p.getTotalLength();
        gsap.set(p, { strokeDasharray: len, strokeDashoffset: reduce ? 0 : len });
      });

      gsap.set(nodeRefs.current, { opacity: reduce ? 1 : 0, y: reduce ? 0 : 12 });

      nodeRefs.current.forEach((n, i) => {
        if (!n) return;
        tl.to(n, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, i * 0.4);
        const path = pathRefs.current[i];
        if (path) {
          tl.to(
            path,
            { strokeDashoffset: 0, duration: 0.6, ease: "power2.inOut" },
            i * 0.4 + 0.2,
          );
        }
      });
    }, wrap);

    return () => ctx.revert();
  }, [paths]);

  return (
    <div ref={wrapperRef} className={className}>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
      >
        <defs>
          <linearGradient id="beam-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.74 0.18 220)" stopOpacity="0" />
            <stop offset="50%" stopColor="oklch(0.74 0.18 220)" stopOpacity="1" />
            <stop offset="100%" stopColor="oklch(0.78 0.16 155)" stopOpacity="1" />
          </linearGradient>
        </defs>
        {paths.map((d, i) => (
          <path
            key={i}
            ref={(el) => {
              pathRefs.current[i] = el;
            }}
            d={d}
            fill="none"
            stroke="url(#beam-grad)"
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="relative z-10 flex flex-col items-center gap-12 md:gap-16">
        {nodes.map((n, i) => (
          <div
            key={n.id}
            ref={(el) => {
              nodeRefs.current[i] = el;
            }}
            className="flex w-64 flex-col items-center rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] px-5 py-4 text-center shadow-lg shadow-black/30 backdrop-blur"
          >
            <div className="font-display text-base font-semibold">{n.label}</div>
            {n.sub ? (
              <div className="mt-1 text-xs text-[var(--color-text-muted)]">{n.sub}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
