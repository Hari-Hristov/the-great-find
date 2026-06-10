import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { SplitReveal } from "./primitives/SplitReveal";
import { Spotlight } from "./primitives/Spotlight";

export function Hero() {
  return (
    <section className="relative grid min-h-screen place-items-center overflow-hidden px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 30%, oklch(0.30 0.05 220 / 0.7), transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-elev)]/60 px-3 py-1 text-xs text-[var(--color-text-muted)] backdrop-blur"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
          local-only · runs on 127.0.0.1
        </motion.div>

        <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
          <SplitReveal by="chars" stagger={0.025}>
            Never miss
          </SplitReveal>
          <br />
          <SplitReveal
            by="chars"
            stagger={0.025}
            delay={0.45}
            className="bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-success)] bg-clip-text text-transparent"
          >
            the great find.
          </SplitReveal>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.1, ease: "easeOut" }}
          className="mx-auto mt-6 max-w-xl text-base text-[var(--color-text-muted)] md:text-lg"
        >
          A locally-installed price monitor for olx.bg. Saved searches polled every
          30 minutes, normalised to EUR, alerts via OS notification and email.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.3, ease: "easeOut" }}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Spotlight className="rounded-[var(--radius-button)]" size={220}>
            <a
              href="/dashboard"
              className="relative z-20 inline-flex items-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-[var(--color-bg-base)] transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              Open the dashboard
              <span aria-hidden>→</span>
            </a>
          </Spotlight>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 rounded-[var(--radius-button)] border border-[var(--color-border-subtle)] px-6 py-3 text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            How it works
          </a>
        </motion.div>
      </div>

      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6, y: [0, 8, 0] }}
        transition={{
          opacity: { duration: 0.8, delay: 1.6 },
          y: { duration: 2.2, repeat: Infinity, ease: "easeInOut" },
        }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[var(--color-text-muted)]"
      >
        <ArrowDown className="h-5 w-5" />
      </motion.div>
    </section>
  );
}
