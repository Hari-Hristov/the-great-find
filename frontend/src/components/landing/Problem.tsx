import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const pains = [
  "Refreshing the same search a hundred times a day.",
  "Missing the listing that matched at 3am.",
  "Watching prices drift without ever knowing the trend.",
  "Getting sniped by someone with a faster F5 finger.",
];

export function Problem() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = gsap.context(() => {
      const items = gsap.utils.toArray<HTMLElement>("[data-pain]");
      gsap.set(items, { opacity: reduce ? 1 : 0, x: reduce ? 0 : -16 });
      ScrollTrigger.batch(items, {
        start: "top 80%",
        onEnter: (els) =>
          gsap.to(els, {
            opacity: 1,
            x: 0,
            duration: 0.6,
            ease: "power2.out",
            stagger: 0.12,
          }),
        once: true,
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative px-6 py-32 md:py-48"
      id="problem"
    >
      <div className="mx-auto max-w-3xl">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
          The problem
        </div>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-5xl">
          Manual hunting{" "}
          <span className="text-[var(--color-text-muted)]">doesn't scale.</span>
        </h2>

        <ul className="mt-12 space-y-5">
          {pains.map((p, i) => (
            <li
              key={i}
              data-pain
              className="flex items-start gap-4 text-lg text-[var(--color-text-muted)] md:text-xl"
            >
              <span
                aria-hidden
                className="mt-2 inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--color-danger)]/70"
              />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
