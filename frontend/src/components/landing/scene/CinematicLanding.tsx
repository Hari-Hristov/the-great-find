import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { ACESFilmicToneMapping } from "three";
import { useNavigate } from "@tanstack/react-router";
import { useSceneStateRef } from "./sceneState";
import type { SceneState } from "./sceneState";
import { useScrollDriver } from "./scrollDriver";
import { ScrollCameraRig } from "./ScrollCameraRig";
import { ConsoleStage } from "./ConsoleStage";
import { SceneEffects } from "./SceneEffects";
import { FlashOverlay } from "./FlashOverlay";
import { HeroOverlays } from "./HeroOverlays";
import { SkipIntroButton } from "./SkipIntroButton";
import { DeliveryCTA } from "./DeliveryCTA";
import { CharacterBackground } from "./CharacterBackground";
import type { Section } from "./types";

const SCROLL_HEIGHT = "700vh";

export function CinematicLanding() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useSceneStateRef();
  const [deliveryActive, setDeliveryActive] = useState(false);
  const [currentSection, setCurrentSection] = useState<Section>("cold-open");
  const navigate = useNavigate();

  const handleDelivery = useCallback((active: boolean) => {
    setDeliveryActive(active);
  }, []);

  const handleSkip = useCallback(() => {
    sessionStorage.setItem("desktop-entered", "1");
    navigate({ to: "/dashboard" });
  }, [navigate]);

  return (
    <div ref={containerRef} style={{ height: SCROLL_HEIGHT }} className="relative">
      {/* Background gradient */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          zIndex: -2,
          background:
            "radial-gradient(ellipse 120% 80% at 60% 30%, #1e1b4b 0%, #0f172a 45%, #0a0f1e 100%)",
        }}
      />

      <div className="pointer-events-none fixed inset-0 z-0">
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [0, 0, 6], fov: 45, near: 0.1, far: 100 }}
          gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping, powerPreference: "high-performance" }}
          performance={{ min: 0.5 }}
        >
          <Suspense fallback={null}>
            <Environment preset="night" />
            <CharacterBackground />
            <ConsoleStage stateRef={stateRef} />
          </Suspense>

          <ScrollCameraRig stateRef={stateRef} />

          <Suspense fallback={null}>
            <SceneEffects />
          </Suspense>
        </Canvas>
      </div>

      <ScrollDriverMount
        containerRef={containerRef}
        stateRef={stateRef}
        onDelivery={handleDelivery}
        onSectionChange={setCurrentSection}
      />

      <HeroOverlays section={currentSection} />
      <FlashOverlay />
      <SkipIntroButton onSkip={handleSkip} />
      <DeliveryCTA visible={deliveryActive} />
    </div>
  );
}

interface DriverProps {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  stateRef: MutableRefObject<SceneState>;
  onDelivery: (active: boolean) => void;
  onSectionChange: (s: Section) => void;
}

function ScrollDriverMount({
  containerRef,
  stateRef,
  onDelivery,
  onSectionChange,
}: DriverProps) {
  useScrollDriver({ containerRef, stateRef, onDelivery });

  const rafRef = useRef<number | null>(null);
  const lastSectionRef = useRef<Section>("cold-open");

  useEffect(() => {
    const tick = () => {
      if (stateRef.current.section !== lastSectionRef.current) {
        lastSectionRef.current = stateRef.current.section;
        onSectionChange(stateRef.current.section);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [stateRef, onSectionChange]);

  return null;
}
