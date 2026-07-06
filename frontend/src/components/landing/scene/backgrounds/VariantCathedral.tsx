import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  Vignette,
  Noise,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import type { SceneState } from "../sceneState";

// Variant: Cathedral
// Reference DNA: Locomotive, Active Theory, FWA-of-the-day 2025 winners
// that lean typographic + architectural. The consoles are exhibits in a
// gallery: hard grid on the floor, ghost type on the back wall, one
// tight accent color per section. Editorial, art-directed, restrained.

const SECTION_ACCENT: Record<SceneState["section"], string> = {
  "cold-open":         "#5aa9ff",
  "3ds-hero":          "#5aa9ff",
  "portal-dive":       "#c46eff",
  "switch-emergence":  "#ff5a8f",
  "pivot":             "#ff5a8f",
  "screen-dive":       "#5affc9",
  "steam-deck":        "#ffb85a",
  "delivery":          "#ffb85a",
};

const SECTION_HEADLINE: Record<SceneState["section"], string> = {
  "cold-open":         "THE GREAT FIND",
  "3ds-hero":          "NINTENDO 3DS",
  "portal-dive":       "OBSERVED",
  "switch-emergence":  "NINTENDO SWITCH",
  "pivot":             "OBSERVED",
  "screen-dive":       "PRICE HISTORY",
  "steam-deck":        "STEAM DECK",
  "delivery":          "DELIVERED",
};

// Wireframe grid plane — hard-edged, no fog fade. Reads as an
// architectural drawing, not an atmospheric floor.
function WireframeGrid({ y, size, divisions, color, opacity }: {
  y: number;
  size: number;
  divisions: number;
  color: string;
  opacity: number;
}) {
  const gridHelper = useMemo(() => {
    const grid = new THREE.GridHelper(size, divisions, color, color);
    const mat = grid.material as THREE.LineBasicMaterial;
    mat.transparent = true;
    mat.opacity = opacity;
    mat.depthWrite = false;
    return grid;
  }, [size, divisions, color, opacity]);

  return <primitive object={gridHelper} position={[0, y, 0]} />;
}

// The back-wall type: giant, tracked-out, cut off by the frame.
// Its color and content shift with the section but the transition is
// via a crossfade of two overlapping Text meshes to avoid flicker.
function BackWallHeadline({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  const [displaySection, setDisplaySection] = useState<SceneState["section"]>("cold-open");
  const [nextSection, setNextSection] = useState<SceneState["section"] | null>(null);
  const activeRef = useRef<THREE.Mesh>(null);
  const nextRef = useRef<THREE.Mesh>(null);
  const transitionRef = useRef(0);

  useFrame((_, delta) => {
    const current = stateRef.current.section;
    if (current !== displaySection && current !== nextSection) {
      setNextSection(current);
      transitionRef.current = 0;
    }

    if (nextSection) {
      transitionRef.current = Math.min(1, transitionRef.current + delta * 1.4);
      if (activeRef.current) {
        const mat = activeRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = (1 - transitionRef.current) * 0.09;
      }
      if (nextRef.current) {
        const mat = nextRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = transitionRef.current * 0.09;
      }
      if (transitionRef.current >= 1) {
        setDisplaySection(nextSection);
        setNextSection(null);
      }
    }
  });

  const activeAccent = SECTION_ACCENT[displaySection];
  const nextAccent = nextSection ? SECTION_ACCENT[nextSection] : activeAccent;
  const activeText = SECTION_HEADLINE[displaySection];
  const nextText = nextSection ? SECTION_HEADLINE[nextSection] : activeText;

  return (
    <group position={[0, 0.2, -14]}>
      <Text
        ref={activeRef}
        fontSize={3.2}
        letterSpacing={-0.02}
        anchorX="center"
        anchorY="middle"
        color={activeAccent}
        material-transparent
        material-opacity={0.09}
        material-depthWrite={false}
      >
        {activeText}
      </Text>
      {nextSection && (
        <Text
          ref={nextRef}
          fontSize={3.2}
          letterSpacing={-0.02}
          anchorX="center"
          anchorY="middle"
          color={nextAccent}
          material-transparent
          material-opacity={0}
          material-depthWrite={false}
        >
          {nextText}
        </Text>
      )}
    </group>
  );
}

// A single vertical line of very small tracked type running down the
// left edge — a filmstrip caption. Reads as art direction, not chrome.
function EdgeCaption({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  const [section, setSection] = useState<SceneState["section"]>("cold-open");
  useFrame(() => {
    const s = stateRef.current.section;
    if (s !== section) setSection(s);
  });

  const label = section.toUpperCase().replace(/-/g, " · ");
  return (
    <Text
      position={[-7.5, 0, -4]}
      rotation={[0, 0, -Math.PI / 2]}
      fontSize={0.18}
      letterSpacing={0.4}
      anchorX="center"
      anchorY="middle"
      color={SECTION_ACCENT[section]}
      material-transparent
      material-opacity={0.55}
      material-depthWrite={false}
    >
      {`— ${label} —`}
    </Text>
  );
}

// Cathedral lighting: cool baseline + one tinted accent that tracks
// the section. The tint drives everything, kept low-intensity so the
// grid dominates the frame, not the light.
function GalleryLights({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  const accentRef = useRef<THREE.PointLight>(null);
  const targetColor = useRef(new THREE.Color(SECTION_ACCENT["cold-open"]));

  useFrame((_, delta) => {
    targetColor.current.set(SECTION_ACCENT[stateRef.current.section]);
    if (accentRef.current) {
      const lerpFactor = 1 - Math.pow(0.04, delta);
      accentRef.current.color.lerp(targetColor.current, lerpFactor);
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} color="#e6ecf5" />
      <pointLight position={[0, 5, 3]} intensity={1.6} color="#f2f4f8" distance={12} />
      <pointLight position={[-5, 1, 5]} intensity={0.7} color="#8899aa" distance={10} />
      <pointLight ref={accentRef} position={[3, -2, -4]} intensity={2.2} distance={11} color={SECTION_ACCENT["cold-open"]} />
    </>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, []);

  return reduced;
}

function CathedralScene({ stateRef }: BackgroundVariantSceneProps) {
  const reduced = usePrefersReducedMotion();

  return (
    <>
      <GalleryLights stateRef={stateRef} />

      {/* Back wall — ghosted type */}
      <BackWallHeadline stateRef={stateRef} />

      {/* Left edge caption */}
      <EdgeCaption stateRef={stateRef} />

      {/* Floor grid (finer) */}
      <WireframeGrid y={-3.5} size={40} divisions={40} color="#2a3548" opacity={0.28} />
      {/* Floor grid (coarse accent lines) */}
      <WireframeGrid y={-3.49} size={40} divisions={8}  color="#4a5a78" opacity={0.5} />

      {/* Ceiling grid — inverted, above camera */}
      <WireframeGrid y={5.5} size={40} divisions={20} color="#1f2838" opacity={0.18} />

      {/* Subtle atmospheric fill — only if motion allowed */}
      {!reduced && <ParallaxDrift />}
    </>
  );
}

// A very slow drift on the grid position so the cathedral never feels
// dead-static. Camera-relative parallax — barely noticeable, but the
// scene reads as "alive" instead of "stopped."
function ParallaxDrift() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.position.x = Math.sin(clock.elapsedTime * 0.08) * 0.15;
  });
  return <group ref={groupRef} />;
}

interface BackgroundVariantSceneProps {
  stateRef: MutableRefObject<SceneState>;
}

export function CathedralDom() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{
        zIndex: -2,
        // Cool near-black graphite. No color at all — the accent lives
        // in-canvas and shifts with the section, so the DOM stays neutral.
        background:
          "linear-gradient(180deg, #10141c 0%, #0a0d14 60%, #05070c 100%)",
      }}
    />
  );
}

export { CathedralScene };

export function CathedralEffects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={0.45} luminanceThreshold={0.65} luminanceSmoothing={0.9} mipmapBlur />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.06} />
      <Vignette darkness={0.55} offset={0.35} />
    </EffectComposer>
  );
}
