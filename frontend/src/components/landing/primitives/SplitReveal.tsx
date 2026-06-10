import { useEffect, useRef } from "react";
import Splitting from "splitting";
import "splitting/dist/splitting.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

interface SplitRevealProps {
  by?: "chars" | "words" | "lines";
  stagger?: number;
  delay?: number;
  trigger?: "load" | "scroll";
  className?: string;
  children: string;
}

export function SplitReveal({
  by = "chars",
  stagger = 0.025,
  delay = 0,
  trigger = "load",
  className,
  children,
}: SplitRevealProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.style.opacity = "1";
      return;
    }

    const result = Splitting({ target: el, by });
    const targets = result[0]?.[by] as HTMLElement[] | undefined;
    if (!targets || targets.length === 0) return;

    gsap.set(targets, { yPercent: 110, opacity: 0 });

    const tween = gsap.to(targets, {
      yPercent: 0,
      opacity: 1,
      duration: 0.7,
      ease: "power3.out",
      stagger,
      delay,
      scrollTrigger:
        trigger === "scroll"
          ? { trigger: el, start: "top 80%", once: true }
          : undefined,
    });

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      ScrollTrigger.refresh();
    };
  }, [by, stagger, delay, trigger]);

  return (
    <span ref={ref} className={cn("inline-block overflow-hidden", className)}>
      {children}
    </span>
  );
}
