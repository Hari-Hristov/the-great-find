import { motion } from "framer-motion";
import { Lock, HardDrive, UserCog } from "lucide-react";
import { Spotlight } from "./primitives/Spotlight";

const cards = [
  {
    icon: Lock,
    title: "127.0.0.1 only",
    body: "The HTTP server binds to loopback. No port exposed to your LAN, no port exposed to the internet.",
  },
  {
    icon: HardDrive,
    title: "Your DB, next to your binary",
    body: "SQLite file lives in your OS user data dir. Move it, back it up, delete it — it's just a file.",
  },
  {
    icon: UserCog,
    title: "No telemetry, no analytics",
    body: "Your saved searches, alerts, and price history stay on your machine. The only outbound traffic is the email notifier you configured.",
  },
];

export function Privacy() {
  return (
    <section className="relative px-6 py-32 md:py-48">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
            Privacy
          </div>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-5xl">
            Your data{" "}
            <span className="text-[var(--color-text-muted)]">stays with you.</span>
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {cards.map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.55, delay: i * 0.1, ease: "easeOut" }}
              >
                <Spotlight
                  size={300}
                  className="h-full rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)]"
                >
                  <div className="relative z-20 flex h-full flex-col p-6">
                    <Icon className="h-5 w-5 text-[var(--color-accent)]" />
                    <div className="mt-4 font-display text-lg font-semibold">
                      {c.title}
                    </div>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                      {c.body}
                    </p>
                  </div>
                </Spotlight>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
