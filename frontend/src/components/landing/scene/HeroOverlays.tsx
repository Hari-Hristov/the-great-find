import { motion, AnimatePresence } from "framer-motion";
import type { Section } from "./types";

const YEAR_BY_SECTION: Partial<Record<Section, string>> = {
  "3ds-hero": "2011",
  "switch-emergence": "2017",
  "steam-deck": "2022",
  delivery: "now",
};

const COPY_BY_SECTION: Partial<Record<Section, { title: string; sub: string }>> = {
  "cold-open": {
    title: "the great find",
    sub: "your console hunt, automated.",
  },
  "3ds-hero": {
    title: "where it started",
    sub: "a handheld in your pocket, a world of deals ahead.",
  },
  "switch-emergence": {
    title: "from handheld to handheld",
    sub: "the hunt evolves.",
  },
  "steam-deck": {
    title: "the modern hunt",
    sub: "every platform. every listing. one search.",
  },
};

interface Props {
  section: Section;
}

export function HeroOverlays({ section }: Props) {
  const year = YEAR_BY_SECTION[section];
  const copy = COPY_BY_SECTION[section];

  return (
    <>
      {/* Year tag — top-right corner */}
      <AnimatePresence mode="wait">
        {year && (
          <motion.div
            key={year}
            className="pointer-events-none fixed right-8 top-8 z-30 font-mono text-xs tracking-widest text-white/40"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {year}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section copy — bottom-left */}
      <AnimatePresence mode="wait">
        {copy && (
          <motion.div
            key={section}
            className="pointer-events-none fixed bottom-16 left-8 z-30 max-w-xs"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <p className="font-display text-xl font-semibold text-white/90 leading-tight">
              {copy.title}
            </p>
            <p className="mt-1 text-sm text-white/50">{copy.sub}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scroll hint — only on cold-open */}
      <AnimatePresence>
        {section === "cold-open" && (
          <motion.div
            key="scroll-hint"
            className="pointer-events-none fixed bottom-8 left-1/2 z-30 -translate-x-1/2"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: 1.2 }}
          >
            <div className="flex flex-col items-center gap-1 text-white/40">
              <div className="h-8 w-px bg-white/30" />
              <span className="text-[10px] tracking-widest uppercase">scroll</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
