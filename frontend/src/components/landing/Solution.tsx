import { AnimatedBeam } from "./primitives/AnimatedBeam";

const nodes = [
  { id: "olx", label: "olx.bg", sub: "saved search polled every 30 min" },
  { id: "poller", label: "Polite poller", sub: "robots.txt-aware, jittered, single-flight" },
  { id: "db", label: "Local SQLite", sub: "next to the binary, EUR-normalised" },
  { id: "rules", label: "Alert rules", sub: "price below, % drop, keyword match" },
  { id: "you", label: "You", sub: "OS notification + email — both, instantly" },
];

export function Solution() {
  return (
    <section
      id="how-it-works"
      className="relative px-6 py-32 md:py-48"
    >
      <div className="mx-auto max-w-3xl text-center">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
          How it works
        </div>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-5xl">
          A quiet pipeline,{" "}
          <span className="bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-success)] bg-clip-text text-transparent">
            running on your machine.
          </span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[var(--color-text-muted)]">
          One single binary. One SQLite file. One job — surface the listings worth
          your attention before anyone else sees them.
        </p>
      </div>

      <div className="mx-auto mt-16 flex max-w-2xl justify-center">
        <AnimatedBeam nodes={nodes} className="relative w-full" />
      </div>
    </section>
  );
}
