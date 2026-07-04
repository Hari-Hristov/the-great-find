import { motion } from "framer-motion";
import { Github } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Spotlight } from "./primitives/Spotlight";

export function CTA() {
  return (
    <section className="relative px-6 py-32 md:py-48">
      <div className="mx-auto max-w-3xl text-center">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="font-display text-4xl font-semibold tracking-tight md:text-6xl"
        >
          Ready to find{" "}
          <span className="bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-success)] bg-clip-text text-transparent">
            the great one?
          </span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          className="mx-auto mt-5 max-w-xl text-[var(--color-text-muted)]"
        >
          Open the dashboard and add your first saved search. Takes about thirty
          seconds.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Spotlight className="rounded-[var(--radius-button)]" size={220}>
            <Link
              to="/dashboard"
              className="relative z-20 inline-flex items-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-[var(--color-bg-base)] transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              Open the dashboard
              <span aria-hidden>→</span>
            </Link>
          </Spotlight>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-[var(--radius-button)] border border-[var(--color-border-subtle)] px-6 py-3 text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
        </motion.div>

        <div className="mt-16 text-xs text-[var(--color-text-muted)]">
          v0.1.0 · single binary · MIT
        </div>
      </div>
    </section>
  );
}
