import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { ACESFilmicToneMapping } from "three";
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
  const [glitchActive, setGlitchActive] = useState(false);
  const [deliveryActive, setDeliveryActive] = useState(false);
  const [currentSection, setCurrentSection] = useState<Section>("cold-open");
  const glitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (glitchTimerRef.current !== null) clearTimeout(glitchTimerRef.current);
    };
  }, []);

  const handleGlitch = useCallback(() => {
    if (glitchTimerRef.current !== null) clearTimeout(glitchTimerRef.current);
    stateRef.current.glitchActive = true;
    setGlitchActive(true);
    glitchTimerRef.current = setTimeout(() => {
      stateRef.current.glitchActive = false;
      setGlitchActive(false);
      glitchTimerRef.current = null;
    }, 300);
  }, [stateRef]);

  const handleDelivery = useCallback((active: boolean) => {
    setDeliveryActive(active);
  }, []);

  const handleSkip = useCallback(() => {
    localStorage.setItem("skipIntro", "true");
    window.location.reload();
  }, []);

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

      <CharacterBackground />

      <div className="pointer-events-none fixed inset-0 z-0">
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [0, 0, 6], fov: 45, near: 0.1, far: 100 }}
          gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping, powerPreference: "high-performance" }}
          performance={{ min: 0.5 }}
        >
          <Suspense fallback={null}>
            <Environment preset="night" />
            <ConsoleStage stateRef={stateRef} />
          </Suspense>

          <ScrollCameraRig stateRef={stateRef} />

          <Suspense fallback={null}>
            <SceneEffects stateRef={stateRef} />
          </Suspense>
        </Canvas>
      </div>

      <ScrollDriverMount
        containerRef={containerRef}
        stateRef={stateRef}
        onGlitch={handleGlitch}
        onDelivery={handleDelivery}
        onSectionChange={setCurrentSection}
      />

      <HeroOverlays section={currentSection} />
      <FlashOverlay glitchActive={glitchActive} />
      <SkipIntroButton onSkip={handleSkip} />
      <DeliveryCTA visible={deliveryActive} />
    </div>
  );
}

interface DriverProps {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  stateRef: MutableRefObject<SceneState>;
  onGlitch: () => void;
  onDelivery: (active: boolean) => void;
  onSectionChange: (s: Section) => void;
}

function ScrollDriverMount({
  containerRef,
  stateRef,
  onGlitch,
  onDelivery,
  onSectionChange,
}: DriverProps) {
  useScrollDriver({ containerRef, stateRef, onGlitch, onDelivery });

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
