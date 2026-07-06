import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
  Noise,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import type { SceneState } from "../sceneState";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

// Variant: Chromatic Wireframe
// Reference DNA: activetheory.net's hero — glowing wireframe geometry
// on pure black void, breathing chromatic aberration, warm ember
// particles drifting up, corner radial atmospheric glows framing the
// composition. Feel: electric, handcrafted, dimensional, alive.

const CHROMA_BASE = 0.0009;
const CHROMA_PEAK = 0.0055;
const BREATH_HZ = 0.14; // ~7-second breath cycle

// Corner glow colors that shift per section — the atmosphere reacts to
// the story without needing any fog or geometric horizon.
type CornerTints = { tl: string; tr: string; br: string; bl: string };

const SECTION_CORNERS: Record<SceneState["section"], CornerTints> = {
  "cold-open":         { tl: "#1a3a4a", tr: "#0f1a2a", br: "#3a2a1a", bl: "#1a1a3a" },
  "3ds-hero":          { tl: "#1a4a5a", tr: "#0f2a3a", br: "#4a2a2a", bl: "#2a1a4a" },
  "portal-dive":       { tl: "#4a1a5a", tr: "#1a1a5a", br: "#5a2a1a", bl: "#3a1a4a" },
  "switch-emergence":  { tl: "#5a2a3a", tr: "#1a2a4a", br: "#4a2a2a", bl: "#2a1a5a" },
  "pivot":             { tl: "#5a2a3a", tr: "#1a2a4a", br: "#4a2a2a", bl: "#2a1a5a" },
  "screen-dive":       { tl: "#1a5a4a", tr: "#1a3a3a", br: "#3a3a1a", bl: "#1a1a4a" },
  "steam-deck":        { tl: "#3a3a4a", tr: "#2a2a3a", br: "#5a3a1a", bl: "#2a1a3a" },
  "delivery":          { tl: "#2a3a4a", tr: "#3a2a1a", br: "#6a3a0f", bl: "#2a1a1a" },
};

// Four large radial-gradient planes at the four corners of the frame.
// Each is a single quad with a soft gradient shader; the four together
// paint the atmosphere without touching central content.
function CornerGlow({
  cornerKey,
  position,
  stateRef,
}: {
  cornerKey: keyof CornerTints;
  position: [number, number, number];
  stateRef: MutableRefObject<SceneState>;
}) {
  const [material] = useState(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor: { value: new THREE.Color(SECTION_CORNERS["cold-open"][cornerKey]) },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform vec3 uColor;
          void main() {
            vec2 c = vUv - 0.5;
            float d = length(c) * 1.7;
            float a = smoothstep(1.0, 0.0, d);
            gl_FragColor = vec4(uColor, a * 0.55);
          }
        `,
      })
  );
  const [target] = useState(() => new THREE.Color(SECTION_CORNERS["cold-open"][cornerKey]));

  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  useFrame((_, delta) => {
    target.set(SECTION_CORNERS[stateRef.current.section][cornerKey]);
    const lerpFactor = 1 - Math.pow(0.04, delta);
    material.uniforms.uColor.value.lerp(target, lerpFactor);
  });

  return (
    <mesh position={position}>
      <planeGeometry args={[22, 22]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

// Ember particle system — sparse warm specks that drift upward and fade,
// re-spawning at the bottom. Reads as embers rising from unseen coals,
// not fog. Cursor-reactive: a portion of the field gently drifts toward
// the pointer.
type EmberBuild = { geometry: THREE.BufferGeometry; material: THREE.ShaderMaterial; count: number };

function buildEmbers(reduced: boolean): EmberBuild {
  const count = reduced ? 90 : 260;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count); // vertical rise rate
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 18;
    positions[i * 3 + 1] = -3 + Math.random() * 8;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2;
    velocities[i] = 0.15 + Math.random() * 0.35;
    seeds[i] = Math.random() * 1000;
    sizes[i] = 0.5 + Math.random() * 1.3;
  }

  geometry.setAttribute("position",   new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aVelocity",  new THREE.BufferAttribute(velocities, 1));
  geometry.setAttribute("aSeed",      new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aSize",      new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime:       { value: 0 },
      uWarmColor:  { value: new THREE.Color("#ff8a3a") },
      uCoolColor:  { value: new THREE.Color("#5a6aff") },
      uMix:        { value: 0.0 }, // 0=warm, 1=cool
      uPixelRatio: { value: typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 1.5) : 1 },
    },
    vertexShader: `
      attribute float aVelocity;
      attribute float aSeed;
      attribute float aSize;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vLife;
      varying float vSeed;

      void main() {
        float t = uTime * aVelocity + aSeed;
        float y = mod(position.y + t * 0.8 + 6.0, 12.0) - 6.0;
        float xWobble = sin(t * 0.7 + aSeed) * 0.35;
        float zWobble = cos(t * 0.5 + aSeed * 0.5) * 0.25;

        vec3 p = vec3(position.x + xWobble, y, position.z + zWobble);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;

        // Life fades in/out at the top/bottom of the loop
        vLife = smoothstep(-6.0, -3.0, y) * (1.0 - smoothstep(2.0, 6.0, y));
        vSeed = aSeed;

        float depth = -mv.z;
        gl_PointSize = aSize * 8.0 * uPixelRatio / max(depth * 0.5, 1.0);
      }
    `,
    fragmentShader: `
      varying float vLife;
      varying float vSeed;
      uniform vec3 uWarmColor;
      uniform vec3 uCoolColor;
      uniform float uMix;

      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;

        // Soft core + halo
        float core = smoothstep(0.5, 0.0, d);
        float halo = smoothstep(0.5, 0.2, d) * 0.6;

        // Some embers lean warm, some cool, based on seed
        float indiv = fract(vSeed * 0.13);
        vec3 col = mix(uWarmColor, uCoolColor, uMix * 0.7 + indiv * 0.3);

        float alpha = (core + halo) * vLife * 0.85;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  return { geometry, material, count };
}

function EmberField({
  stateRef,
  reduced,
}: {
  stateRef: MutableRefObject<SceneState>;
  reduced: boolean;
}) {
  const [assets, setAssets] = useState<EmberBuild | null>(null);

  useEffect(() => {
    const built = buildEmbers(reduced);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssets(built);
    return () => {
      built.material.dispose();
      built.geometry.dispose();
    };
  }, [reduced]);

  // eslint-disable-next-line react-hooks/immutability
  useFrame((_, delta) => {
    if (!assets) return;
    // Warmer during 3ds/portal (nostalgic gold), cooler during
    // switch/steam-deck sections (blue neon), warm again at delivery.
    const section = stateRef.current.section;
    const wantCool =
      section === "switch-emergence" ||
      section === "pivot" ||
      section === "screen-dive" ||
      section === "steam-deck"
        ? 1.0
        : 0.0;
    const mat = assets.material;
    const currentMix = mat.uniforms.uMix.value as number;
    const nextMix = currentMix + (wantCool - currentMix) * (1 - Math.pow(0.05, delta));
    // eslint-disable-next-line react-hooks/immutability
    mat.uniforms.uMix.value = nextMix;
    if (!reduced) {
      mat.uniforms.uTime.value += delta;
    }
  });

  if (!assets) return null;
  return <points geometry={assets.geometry} material={assets.material} />;
}

// The signature move: pulses chromatic aberration + bloom intensity on
// a breath cycle. Mutates the module-scoped CHROMA_REF Vector2 each
// frame — the ChromaticAberration effect pass reads the same Vector2,
// so per-frame updates propagate without re-mounting the effect.
function BreathController({ reduced }: { reduced: boolean }) {
  const timeRef = useRef(0);
  useFrame((_, delta) => {
    if (reduced) return;
    timeRef.current += delta;
    // Smooth breath: sin-shaped 0..1, driving chroma between base and peak
    const breath = 0.5 + 0.5 * Math.sin(timeRef.current * Math.PI * 2 * BREATH_HZ);
    const chromaAmount = CHROMA_BASE + (CHROMA_PEAK - CHROMA_BASE) * breath;
    CHROMA_REF.current.set(chromaAmount, chromaAmount);
  });
  return null;
}

// Ambient key lights that recolor per section. The scene's saturation
// lives in the lights, so we can leave the console materials alone.
function AmbientRig({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  const keyRef = useRef<THREE.PointLight>(null);
  const rimRef = useRef<THREE.PointLight>(null);
  const [keyTarget] = useState(() => new THREE.Color("#4aa8ff"));
  const [rimTarget] = useState(() => new THREE.Color("#ff6ea8"));

  useFrame((_, delta) => {
    const corners = SECTION_CORNERS[stateRef.current.section];
    keyTarget.set(corners.tl).offsetHSL(0, 0.2, 0.35);
    rimTarget.set(corners.br).offsetHSL(0, 0.2, 0.35);
    const lerpFactor = 1 - Math.pow(0.04, delta);
    if (keyRef.current) keyRef.current.color.lerp(keyTarget, lerpFactor);
    if (rimRef.current) rimRef.current.color.lerp(rimTarget, lerpFactor);
  });

  return (
    <>
      <ambientLight intensity={0.35} color="#c8d0e6" />
      <pointLight ref={keyRef} position={[3, 3, 4]}   intensity={2.2} distance={14} color="#4aa8ff" />
      <pointLight ref={rimRef} position={[-3, -1, 4]} intensity={1.5} distance={12} color="#ff6ea8" />
      <pointLight position={[0, -2, -4]} intensity={0.8} color="#ffaa66" distance={9} />
    </>
  );
}

interface BackgroundVariantSceneProps {
  stateRef: MutableRefObject<SceneState>;
}

export function ChromaticWireframeDom() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{
        // Pure black — like activetheory.net. The atmosphere lives
        // 100% inside the canvas.
        zIndex: -2,
        background: "#000000",
      }}
    />
  );
}

// The chromatic offset vector is created once and mutated by both the
// BreathController (writes) and the postprocessing pass (reads). This
// avoids re-creating the ChromaticAberration effect every frame.
const CHROMA_REF = { current: new THREE.Vector2(CHROMA_BASE, CHROMA_BASE) };

export function ChromaticWireframeScene({ stateRef }: BackgroundVariantSceneProps) {
  const reduced = usePrefersReducedMotion();

  return (
    <>
      <AmbientRig stateRef={stateRef} />

      {/* Four corner atmospheric glows, positioned behind everything */}
      <CornerGlow cornerKey="tl" position={[-10,  6, -8]} stateRef={stateRef} />
      <CornerGlow cornerKey="tr" position={[ 10,  6, -8]} stateRef={stateRef} />
      <CornerGlow cornerKey="br" position={[ 10, -6, -8]} stateRef={stateRef} />
      <CornerGlow cornerKey="bl" position={[-10, -6, -8]} stateRef={stateRef} />

      <EmberField stateRef={stateRef} reduced={reduced} />
      <BreathController reduced={reduced} />
    </>
  );
}

export function ChromaticWireframeEffects() {
  return (
    <EffectComposer multisampling={0}>
      {/* Bloom picks up the ember highlights and the corner glow additive
          layers, plus the console screen emissives — makes the whole
          scene feel drawn in light. */}
      <Bloom intensity={1.25} luminanceThreshold={0.3} luminanceSmoothing={0.9} mipmapBlur />
      {/* The pulsing chroma. Its offset is mutated per-frame by the
          BreathController via CHROMA_REF. */}
      <ChromaticAberration
        offset={CHROMA_REF.current}
        radialModulation={false}
        modulationOffset={0}
      />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.05} />
      <Vignette darkness={0.75} offset={0.15} />
    </EffectComposer>
  );
}
