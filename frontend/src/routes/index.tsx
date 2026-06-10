import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LenisProvider } from "@/components/landing/LenisProvider";
import { Hero } from "@/components/landing/Hero";

const Problem = lazy(() =>
  import("@/components/landing/Problem").then((m) => ({ default: m.Problem })),
);
const Solution = lazy(() =>
  import("@/components/landing/Solution").then((m) => ({ default: m.Solution })),
);
const LiveNumbers = lazy(() =>
  import("@/components/landing/LiveNumbers").then((m) => ({ default: m.LiveNumbers })),
);
const Privacy = lazy(() =>
  import("@/components/landing/Privacy").then((m) => ({ default: m.Privacy })),
);
const CTA = lazy(() =>
  import("@/components/landing/CTA").then((m) => ({ default: m.CTA })),
);

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <LenisProvider>
      <div className="min-h-full bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
        <Hero />
        <Suspense fallback={<SectionSkeleton />}>
          <Problem />
          <Solution />
          <LiveNumbers />
          <Privacy />
          <CTA />
        </Suspense>
      </div>
    </LenisProvider>
  );
}

function SectionSkeleton() {
  return <div aria-hidden className="h-screen" />;
}
