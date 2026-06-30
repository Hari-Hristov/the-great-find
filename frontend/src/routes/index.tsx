import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LenisProvider } from "@/components/landing/LenisProvider";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

const Cinematic = lazy(() =>
  import("@/components/landing/scene/CinematicLanding").then((m) => ({
    default: m.CinematicLanding,
  })),
);

function LandingPage() {
  return (
    <LenisProvider>
      <Suspense fallback={<CinematicSkeleton />}>
        <Cinematic />
      </Suspense>
    </LenisProvider>
  );
}

function CinematicSkeleton() {
  return <div className="fixed inset-0 bg-[#090912]" aria-hidden />;
}
