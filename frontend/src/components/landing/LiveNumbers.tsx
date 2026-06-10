import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { NumberTicker } from "./primitives/NumberTicker";

interface Stat {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  sub: string;
}

const stats: Stat[] = [
  { value: 30, suffix: " min", label: "Poll interval", sub: "default — adjustable per saved search" },
  { value: 1, prefix: "≤ ", suffix: " req/s", label: "Polite by default", sub: "single in-flight per host, jittered 1-2s" },
  { value: 0, suffix: " ¢", label: "Cost to run", sub: "no servers, no SaaS, just your machine" },
];

export function LiveNumbers() {
  const sectionRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const headline = headlineRef.current;
    if (!section || !headline) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: "+=80%",
        pin: headline,
        pinSpacing: false,
        scrub: false,
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative px-6 py-32 md:py-48"
    >
      <div className="mx-auto max-w-5xl">
        <div ref={headlineRef} className="pt-12">
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
            By the numbers
          </div>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-5xl">
            The defaults are{" "}
            <span className="text-[var(--color-accent)]">on your side.</span>
          </h2>
        </div>

        <div className="mt-24 grid grid-cols-1 gap-6 md:grid-cols-3">
          {stats.map((s, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-6"
            >
              <div className="font-display text-5xl font-semibold tracking-tight md:text-6xl">
                {s.prefix ? (
                  <span className="text-[var(--color-text-muted)]">{s.prefix}</span>
                ) : null}
                <NumberTicker value={s.value} className="tabular-nums" />
                {s.suffix ? (
                  <span className="ml-1 text-[var(--color-text-muted)]">{s.suffix}</span>
                ) : null}
              </div>
              <div className="mt-3 text-sm font-medium">{s.label}</div>
              <div className="mt-1 text-xs text-[var(--color-text-muted)]">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
