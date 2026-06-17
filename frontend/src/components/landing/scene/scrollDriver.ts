import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { MutableRefObject } from "react";
import type { SceneState } from "./sceneState";
import type { Section } from "./types";

gsap.registerPlugin(ScrollTrigger);

const BANDS: Array<{ section: Section; start: number; end: number }> = [
  { section: "cold-open", start: 0, end: 0.1 },
  { section: "3ds-hero", start: 0.1, end: 0.28 },
  { section: "portal-dive", start: 0.28, end: 0.38 },
  { section: "switch-emergence", start: 0.38, end: 0.54 },
  { section: "pivot", start: 0.54, end: 0.64 },
  { section: "steam-deck", start: 0.64, end: 0.82 },
  { section: "delivery", start: 0.82, end: 1.0 },
];

function sectionAt(progress: number): { section: Section; sectionProgress: number } {
  for (const b of BANDS) {
    if (progress >= b.start && progress < b.end) {
      return {
        section: b.section,
        sectionProgress: (progress - b.start) / (b.end - b.start),
      };
    }
  }
  return { section: "delivery", sectionProgress: 1 };
}

interface Opts {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  stateRef: MutableRefObject<SceneState>;
  onGlitch: () => void;
  onDelivery: (active: boolean) => void;
}

export function useScrollDriver({ containerRef, stateRef, onGlitch, onDelivery }: Opts) {
  const glitchFiredAt = useRef(-1);
  const deliveryActiveRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const trigger = ScrollTrigger.create({
      trigger: container,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: (self) => {
        const p = self.progress;
        const { section, sectionProgress } = sectionAt(p);
        stateRef.current.section = section;
        stateRef.current.sectionProgress = sectionProgress;

        if (p >= 0.54 && glitchFiredAt.current < 0.54) {
          glitchFiredAt.current = p;
          onGlitch();
        }
        if (p < 0.54) glitchFiredAt.current = -1;

        const inDelivery = section === "delivery";
        if (inDelivery !== deliveryActiveRef.current) {
          deliveryActiveRef.current = inDelivery;
          onDelivery(inDelivery);
        }
      },
    });

    return () => {
      trigger.kill();
    };
  }, [containerRef, stateRef, onGlitch, onDelivery]);
}

export const CAMERA_BY_SECTION: Record<
  Section,
  { position: [number, number, number]; target: [number, number, number]; fov: number }
> = {
  "cold-open": { position: [0, 0, 6], target: [0, 0, 0], fov: 45 },
  "3ds-hero": { position: [0.4, 0.3, 4.5], target: [0, 0, 0], fov: 42 },
  "portal-dive": { position: [0, -0.2, 1.8], target: [0, -0.35, 0], fov: 35 },
  "switch-emergence": { position: [0, -1.2, 3.5], target: [0, 0, 0], fov: 44 },
  pivot: { position: [3.0, 0.2, 2.8], target: [0, 0, 0], fov: 42 },
  "steam-deck": { position: [0.3, 0.1, 4.2], target: [0, 0, 0], fov: 40 },
  delivery: { position: [0, 0, 1.6], target: [0, 0, 0], fov: 32 },
};
