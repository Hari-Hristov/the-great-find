import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LenisProvider } from "@/components/landing/LenisProvider";
import { Hero } from "@/components/landing/Hero";
import { useCanRender3D } from "@/hooks/useCanRender3D";

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

// Lazy-created at module level so Vite doesn't prefetch R3F until first call,
// but the component reference is stable across renders.
let CinematicLanding: React.ComponentType | null = null;
function getCinematicLanding() {
  if (!CinematicLanding) {
    CinematicLanding = lazy(() =>
      import("@/components/landing/scene/CinematicLanding").then((m) => ({
        default: m.CinematicLanding,
      })),
    );
  }
  return CinematicLanding;
}

const Cinematic = getCinematicLanding();

function LandingPage() {
  const can3D = useCanRender3D();
  const skipIntro =
    typeof window !== "undefined" && localStorage.getItem("skipIntro") === "true";

  if (can3D && !skipIntro) {
    return (
      <Suspense fallback={<CinematicSkeleton />}>
        <Cinematic />
      </Suspense>
    );
  }

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

function CinematicSkeleton() {
  return <div className="fixed inset-0 bg-[#090912]" aria-hidden />;
}

function SectionSkeleton() {
  return <div aria-hidden className="h-screen" />;
}
