import { useState, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";
import type { MutableRefObject } from "react";
import type { SceneState } from "./sceneState";
import { Console3DS, ConsoleSwitch, ConsoleSteamDeck } from "./Consoles";

const SPARKLE_COLORS = ["#ff6eb4", "#7eb8ff", "#a78bfa", "#34d399", "#fbbf24", "#f87171"];

function DriftLight({ offset }: { offset: number }) {
  const ref = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime + offset;
    ref.current.position.set(Math.sin(t * 0.3) * 3, Math.cos(t * 0.2) * 2, 2);
  });
  return <pointLight ref={ref} intensity={1.5} distance={8} color="#7799ee" />;
}

function ActiveConsoles({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  const [section, setSection] = useState<SceneState["section"]>("cold-open");
  const sectionRef = useRef<SceneState["section"]>("cold-open");
  useFrame(() => {
    const next = stateRef.current.section;
    if (next !== sectionRef.current) {
      sectionRef.current = next;
      setSection(next);
    }
  });

  const show3ds = section === "3ds-hero" || section === "portal-dive";
  const showSwitch = section === "switch-emergence" || section === "pivot" || section === "screen-dive";
  const showDeck = section === "steam-deck" || section === "delivery";

  return (
    <>
      <Console3DS visible={show3ds} />
      <ConsoleSwitch visible={showSwitch} />
      <ConsoleSteamDeck visible={showDeck} />
    </>
  );
}

export function ConsoleStage({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  return (
    <group>
      <ambientLight intensity={0.6} />
      <DriftLight offset={0} />
      <DriftLight offset={Math.PI} />
      <pointLight position={[5, 5, 5]} intensity={2.2} color="#ffffff" />
      <pointLight position={[-4, -2, 3]} intensity={1.0} color="#8855ff" />
      <pointLight position={[0, 0, -6]} intensity={1.2} color="#aabbff" />
      {SPARKLE_COLORS.map((color, i) => (
        <Sparkles
          key={color}
          count={36}
          scale={6}
          size={1.4}
          speed={0.25 + i * 0.04}
          color={color}
        />
      ))}
      <ActiveConsoles stateRef={stateRef} />
    </group>
  );
}
