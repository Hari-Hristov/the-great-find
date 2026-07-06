import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  EffectComposer,
  Bloom,
  Vignette,
  Noise,
  ChromaticAberration,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import type { SceneState } from "../sceneState";

// Variant: Depths
// Reference DNA: Igloo Inc, DogStudio, Bruno Simon's early portfolios,
// Awwwards SOTD projects that use exponential fog + a receding horizon
// plane as their only "environment." The consoles look like objects
// lifted from a black lake at night. Volumetric depth, no clutter.

const FOG_NEAR = 4;
const FOG_FAR = 22;

const SECTION_HORIZON_TINT: Record<SceneState["section"], THREE.ColorRepresentation> = {
  "cold-open":         "#0a0f1e",
  "3ds-hero":          "#0e1428",
  "portal-dive":       "#241633", // magenta wash on portal entry
  "switch-emergence":  "#0f1a2c",
  "pivot":             "#0f1a2c",
  "screen-dive":       "#111c30",
  "steam-deck":        "#1a1a2c",
  "delivery":          "#2a1e18", // warm amber horizon on delivery
};

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

function DepthsFog({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  const { scene } = useThree();
  const [targetColor] = useState(() => new THREE.Color(SECTION_HORIZON_TINT["cold-open"]));
  const [currentColor] = useState(() => new THREE.Color(SECTION_HORIZON_TINT["cold-open"]));
  const [fog] = useState(() => new THREE.Fog(currentColor, FOG_NEAR, FOG_FAR));
  const [background] = useState(() => new THREE.Color(currentColor));

  useEffect(() => {
    // Direct assignment to scene.fog / scene.background is the canonical
    // R3F pattern for scene-wide atmospheric properties. The linter's
    // react-hooks/immutability rule flags any mutation of hook-returned
    // objects; here it's a false positive against a first-party three.js
    // API — there is no alternative way to set scene fog.
    const previousFog = scene.fog;
    const previousBackground = scene.background;
    // eslint-disable-next-line react-hooks/immutability
    scene.fog = fog;
    scene.background = background;
    return () => {
      scene.fog = previousFog;
      scene.background = previousBackground;
    };
  }, [scene, fog, background]);

  useFrame((_, delta) => {
    const section = stateRef.current.section;
    targetColor.set(SECTION_HORIZON_TINT[section]);
    const lerpFactor = 1 - Math.pow(0.05, delta);
    currentColor.lerp(targetColor, lerpFactor);
    fog.color.copy(currentColor);
    background.copy(currentColor);
  });

  return null;
}

// A receding grid plane that fades into the fog — Blade Runner floor,
// not Tron floor. The lines are close to invisible at the horizon,
// crisp near the camera.
function HorizonGrid() {
  const [material] = useState(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        uniforms: {
          uColor:     { value: new THREE.Color("#3a5a8a") },
          uGridSize:  { value: 0.5 },
          uLineWidth: { value: 0.02 },
          uFadeStart: { value: 3.0 },
          uFadeEnd:   { value: 30.0 },
        },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vWorldPos;
          void main() {
            vUv = uv;
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorldPos = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          varying vec3 vWorldPos;
          uniform vec3 uColor;
          uniform float uGridSize;
          uniform float uLineWidth;
          uniform float uFadeStart;
          uniform float uFadeEnd;

          float gridLine(vec2 p, float size, float width) {
            vec2 g = abs(fract(p / size - 0.5) - 0.5) / fwidth(p / size);
            float line = min(g.x, g.y);
            return 1.0 - smoothstep(0.0, width * 40.0, line);
          }

          void main() {
            float g1 = gridLine(vWorldPos.xz, uGridSize, uLineWidth);
            float g2 = gridLine(vWorldPos.xz, uGridSize * 5.0, uLineWidth * 0.5) * 0.5;
            float grid = max(g1, g2);

            float dist = length(vWorldPos.xz);
            float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);

            float radial = 1.0 - smoothstep(0.0, 15.0, dist);

            float alpha = grid * fade * (0.15 + radial * 0.4);
            gl_FragColor = vec4(uColor, alpha);
          }
        `,
      })
  );

  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.5, 0]}>
      <planeGeometry args={[60, 60]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

// A single distant "sun" — a soft radial disk far behind the consoles.
// Its color drifts with the section tint. Gives the scene a horizon
// anchor without adding real geometry.
function DistantSun({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  const [material] = useState(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uColor: { value: new THREE.Color("#5588ff") },
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
            float d = length(c);
            float core = 1.0 - smoothstep(0.0, 0.15, d);
            float halo = 1.0 - smoothstep(0.1, 0.5, d);
            float a = core * 0.9 + halo * 0.35;
            gl_FragColor = vec4(uColor, a);
          }
        `,
      })
  );
  const [targetColor] = useState(() => new THREE.Color("#5588ff"));

  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  useFrame((_, delta) => {
    const section = stateRef.current.section;
    targetColor.set(SECTION_HORIZON_TINT[section]);
    // Lift the tint toward the light range so the sun always reads as bright
    targetColor.offsetHSL(0, 0, 0.35);
    const lerpFactor = 1 - Math.pow(0.05, delta);
    material.uniforms.uColor.value.lerp(targetColor, lerpFactor);
  });

  return (
    <mesh position={[0, 1.5, -18]}>
      <planeGeometry args={[14, 14]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

// Soft rim light that hangs above and slightly behind the consoles,
// mimicking a lone key light in a dark studio.
function AtmosphericLights({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  const rimRef = useRef<THREE.PointLight>(null);
  const [targetColor] = useState(() => new THREE.Color("#7ea8ff"));
  const [scratch] = useState(() => new THREE.Color());

  useFrame((_, delta) => {
    const section = stateRef.current.section;
    scratch.set(SECTION_HORIZON_TINT[section]);
    scratch.offsetHSL(0, 0.1, 0.35);
    targetColor.copy(scratch);
    if (rimRef.current) {
      const lerpFactor = 1 - Math.pow(0.05, delta);
      rimRef.current.color.lerp(targetColor, lerpFactor);
    }
  });

  return (
    <>
      <ambientLight intensity={0.35} color="#8fa8d0" />
      <pointLight ref={rimRef} position={[0, 4, -3]} intensity={2.0} distance={14} color="#7ea8ff" />
      <pointLight position={[4, 2, 4]} intensity={1.4} color="#c8d8ff" distance={10} />
      <pointLight position={[-4, -1, 3]} intensity={0.9} color="#4a5a8a" distance={9} />
    </>
  );
}

// A minimal particle field — much sparser than the current Sparkles.
// Reads as suspended dust in a light shaft, not a party.
function FloatingDustMotes() {
  const pointsRef = useRef<THREE.Points>(null);
  const [assets] = useState(() => {
    const geometry = new THREE.BufferGeometry();
    const count = 220;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 24;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20 - 4;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: "#c8d8ff",
      size: 0.03,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry, material };
  });

  useEffect(() => {
    return () => {
      assets.geometry.dispose();
      assets.material.dispose();
    };
  }, [assets]);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y = clock.elapsedTime * 0.015;
  });

  return <points ref={pointsRef} geometry={assets.geometry} material={assets.material} />;
}

interface BackgroundVariantSceneProps {
  stateRef: MutableRefObject<SceneState>;
}

export function DepthsDom() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{
        zIndex: -2,
        // Deep water gradient — near-black with a slight lift at the top
        // where the DistantSun sits. Fallback if canvas fails to render.
        background:
          "radial-gradient(ellipse 90% 60% at 50% 25%, #182238 0%, #0a0f1e 55%, #05070f 100%)",
      }}
    />
  );
}

export function DepthsScene({ stateRef }: BackgroundVariantSceneProps) {
  const reduced = usePrefersReducedMotion();

  return (
    <>
      <DepthsFog stateRef={stateRef} />
      <AtmosphericLights stateRef={stateRef} />
      <DistantSun stateRef={stateRef} />
      <HorizonGrid />
      {!reduced && <FloatingDustMotes />}
    </>
  );
}

export function DepthsEffects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={0.75} luminanceThreshold={0.45} luminanceSmoothing={0.85} mipmapBlur />
      <ChromaticAberration offset={new THREE.Vector2(0.0006, 0.0006)} radialModulation={false} modulationOffset={0} />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.05} />
      <Vignette darkness={0.7} offset={0.2} />
    </EffectComposer>
  );
}
