import { useEffect, useState } from "react";
import type { MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
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
import { ModelWithFallback } from "../ModelLoader";

// Variant: Nebula
// Reference DNA: Zajno cinematic microsites, Studio Ambient / Off-Brand,
// A24-style sci-fi trailer palettes. Thousands of GPU-instanced motes
// drift through a curl-noise flow field. The consoles float in the
// cloud like probes. Most "cinematic" of the three — heaviest atmosphere.

const SECTION_TINT_A: Record<SceneState["section"], string> = {
  "cold-open":         "#1a1f3a",
  "3ds-hero":          "#251a4a",
  "portal-dive":       "#4a1a5a",
  "switch-emergence":  "#1a2a4a",
  "pivot":             "#3a1a4a",
  "screen-dive":       "#1a3a4a",
  "steam-deck":        "#3a2a1a",
  "delivery":          "#4a2f1a",
};

const SECTION_TINT_B: Record<SceneState["section"], string> = {
  "cold-open":         "#08081a",
  "3ds-hero":          "#0a0820",
  "portal-dive":       "#1a0820",
  "switch-emergence":  "#080a20",
  "pivot":             "#180a20",
  "screen-dive":       "#08181a",
  "steam-deck":        "#1a1408",
  "delivery":          "#2a1a08",
};

const VERTEX_SHADER = `
  attribute float aSeed;
  attribute float aSize;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vSeed;
  varying float vDepth;

  // Cheap pseudo-curl-noise via layered sines. Reads identically to
  // proper curl-noise for a background field at a fraction of the cost.
  vec3 flow(vec3 p, float t) {
    float s = aSeed * 0.1;
    vec3 offset = vec3(
      sin(t * 0.15 + p.y * 0.3 + s) * 0.6 + cos(t * 0.1 + p.z * 0.2) * 0.4,
      cos(t * 0.12 + p.x * 0.25 + s) * 0.5 + sin(t * 0.08 + p.z * 0.3) * 0.3,
      sin(t * 0.09 + p.x * 0.2 + s) * 0.4 + cos(t * 0.11 + p.y * 0.25) * 0.3
    );
    return p + offset;
  }

  void main() {
    vec3 animated = flow(position, uTime);
    vec4 mv = modelViewMatrix * vec4(animated, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = -mv.z;
    vDepth = depth;
    gl_PointSize = aSize * 400.0 * uPixelRatio / max(depth, 1.0);
    vSeed = aSeed;
  }
`;

const FRAGMENT_SHADER = `
  varying float vSeed;
  varying float vDepth;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float alpha = smoothstep(0.5, 0.0, d);
    float depthFade = smoothstep(25.0, 8.0, vDepth);
    alpha *= depthFade * 0.55;
    float mixFactor = fract(vSeed * 0.31);
    vec3 col = mix(uColorA, uColorB, mixFactor);
    gl_FragColor = vec4(col, alpha);
  }
`;

function buildNebulaField(reduced: boolean) {
  const count = reduced ? 800 : 3200;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const r = Math.pow(Math.random(), 0.5) * 18;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
    positions[i * 3 + 2] = r * Math.cos(phi) - 2;
    seeds[i] = Math.random() * 100;
    sizes[i] = 0.02 + Math.random() * 0.08;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime:       { value: 0 },
      uColorA:     { value: new THREE.Color("#7ea8ff") },
      uColorB:     { value: new THREE.Color("#c46eff") },
      uPixelRatio: { value: typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 1.5) : 1 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });

  return { geometry, material };
}

// Single component: builds geometry+material once, animates uTime,
// and drives color from the section. Assets are built lazily on mount
// so we're never touching a ref during render, and are disposed on
// unmount for a clean r3f lifecycle.
function NebulaField({ stateRef, reduced }: {
  stateRef: MutableRefObject<SceneState>;
  reduced: boolean;
}) {
  const [assets, setAssets] = useState<ReturnType<typeof buildNebulaField> | null>(null);
  const [targetA] = useState(() => new THREE.Color(SECTION_TINT_A["cold-open"]));
  const [targetB] = useState(() => new THREE.Color(SECTION_TINT_A["cold-open"]));

  useEffect(() => {
    const built = buildNebulaField(reduced);
    // Lazy-init via setState in an effect: geometry/material allocation
    // can't happen during render (creates side effects outside React),
    // and can't happen in useMemo because it depends on `reduced` and
    // must be disposable. This is a legitimate mount-time init.
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
    // R3F canonical pattern: mutate shader uniforms in useFrame. The
    // linter flags this as mutating a hook-returned value; the mutation
    // is intentional and is what makes the shader animate at all.
    const material = assets.material;
    if (!reduced) {
      // eslint-disable-next-line react-hooks/immutability
      material.uniforms.uTime.value += delta;
    }

    const section = stateRef.current.section;
    targetA.set(SECTION_TINT_A[section]);
    targetA.offsetHSL(0, 0.15, 0.42);
    targetB.set(SECTION_TINT_A[section]);
    targetB.offsetHSL(0.05, 0.2, 0.28);

    const lerpFactor = 1 - Math.pow(0.04, delta);
    material.uniforms.uColorA.value.lerp(targetA, lerpFactor);
    material.uniforms.uColorB.value.lerp(targetB, lerpFactor);
  });

  if (!assets) return null;
  return <points geometry={assets.geometry} material={assets.material} />;
}

// Distant idols — a couple of the game characters, pushed way back
// so they read as distant landmarks in the cloud rather than clutter.
function DistantIdols() {
  return (
    <group>
      <Float speed={0.6} floatIntensity={0.15} rotationIntensity={0.02}>
        <group position={[-6.5, 1.8, -16]} rotation={[0, 0.4, 0]}>
          <ModelWithFallback
            path="./models/hollow_knight.glb"
            scale={3.5}
            fallback={<mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><meshBasicMaterial color="#a78bfa" /></mesh>}
          />
        </group>
      </Float>
      <Float speed={0.5} floatIntensity={0.2} rotationIntensity={0.02}>
        <group position={[6.5, -1.2, -14]} rotation={[0, -0.5, 0]}>
          <ModelWithFallback
            path="./models/power_suit_samus.glb"
            scale={0.4}
            fallback={<mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><meshBasicMaterial color="#7eb8ff" /></mesh>}
          />
        </group>
      </Float>
    </group>
  );
}

// Section-driven ambient tint — a large emissive plane far behind the
// scene provides a color wash that shifts as sections change.
function AmbientBackplane({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  const [material] = useState(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColorA: { value: new THREE.Color(SECTION_TINT_A["cold-open"]) },
          uColorB: { value: new THREE.Color(SECTION_TINT_B["cold-open"]) },
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
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          void main() {
            vec2 c = vUv - 0.5;
            float d = length(c) * 1.8;
            vec3 col = mix(uColorA, uColorB, smoothstep(0.0, 1.0, d));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
  );
  const [targetA] = useState(() => new THREE.Color(SECTION_TINT_A["cold-open"]));
  const [targetB] = useState(() => new THREE.Color(SECTION_TINT_B["cold-open"]));

  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  useFrame((_, delta) => {
    const section = stateRef.current.section;
    targetA.set(SECTION_TINT_A[section]);
    targetB.set(SECTION_TINT_B[section]);
    const lerpFactor = 1 - Math.pow(0.04, delta);
    material.uniforms.uColorA.value.lerp(targetA, lerpFactor);
    material.uniforms.uColorB.value.lerp(targetB, lerpFactor);
  });

  return (
    <mesh position={[0, 0, -25]}>
      <planeGeometry args={[80, 50]} />
      <primitive object={material} attach="material" />
    </mesh>
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

interface BackgroundVariantSceneProps {
  stateRef: MutableRefObject<SceneState>;
}

export function NebulaDom() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{
        zIndex: -2,
        // Deep indigo → oxblood → near-black. Sci-fi trailer palette,
        // sits behind the canvas as fallback + adds a warm oxblood
        // bleed at the corner the AmbientBackplane can't reach.
        background:
          "radial-gradient(ellipse 100% 70% at 30% 70%, #3a1a2a 0%, #1a1030 40%, #08081a 75%, #04040c 100%)",
      }}
    />
  );
}

export function NebulaScene({ stateRef }: BackgroundVariantSceneProps) {
  const reduced = usePrefersReducedMotion();
  return (
    <>
      <ambientLight intensity={0.4} color="#a8b8e0" />
      <pointLight position={[4, 4, 5]}   intensity={1.8} color="#ffffff" distance={12} />
      <pointLight position={[-4, -2, 3]} intensity={1.0} color="#c46eff" distance={10} />
      <pointLight position={[0, 2, -8]}  intensity={1.2} color="#7ea8ff" distance={14} />

      <AmbientBackplane stateRef={stateRef} />
      <NebulaField stateRef={stateRef} reduced={reduced} />
      <DistantIdols />
    </>
  );
}

export function NebulaEffects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={1.1} luminanceThreshold={0.35} luminanceSmoothing={0.9} mipmapBlur />
      <ChromaticAberration offset={new THREE.Vector2(0.0018, 0.0018)} radialModulation={false} modulationOffset={0} />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.04} />
      <Vignette darkness={0.6} offset={0.25} />
    </EffectComposer>
  );
}
