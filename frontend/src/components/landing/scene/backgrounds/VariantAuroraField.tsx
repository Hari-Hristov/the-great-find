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

// Variant: Aurora Field
// Reference DNA: activetheory.net's atmospheric side + Igloo-style
// slow-motion color fields. A single fullscreen fragment shader draws
// flowing bands of color that morph like dyed smoke behind glass. The
// consoles float in front, backlit by the aurora. Feel: dreamy, sonic,
// slow-cinematic.

// Two color stops per section — hueA is the dominant band, hueB is the
// counter-band that ribbons through it.
type AuroraTint = { a: string; b: string };

const SECTION_AURORA: Record<SceneState["section"], AuroraTint> = {
  "cold-open":         { a: "#1a3a5a", b: "#0a1a2a" },
  "3ds-hero":          { a: "#2a4a7a", b: "#1a2a5a" },
  "portal-dive":       { a: "#7a2a8a", b: "#3a1a6a" }, // violet aurora
  "switch-emergence":  { a: "#2a5a7a", b: "#1a3a5a" },
  "pivot":             { a: "#5a3a7a", b: "#2a2a5a" },
  "screen-dive":       { a: "#2a7a6a", b: "#1a4a3a" }, // teal aurora
  "steam-deck":        { a: "#7a5a3a", b: "#3a2a1a" },
  "delivery":          { a: "#c88a3a", b: "#5a2a0a" }, // warm gold aurora
};

// The aurora shader — layered fractal brownian motion sampled through
// a domain-warped uv, producing flowing bands. Runs at native canvas
// resolution but the shader is cheap: fBM at 4 octaves, single warp.
const AURORA_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const AURORA_FRAG = `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorDark;
  uniform float uIntensity;

  // Simplex-style hash (cheap; good enough for smooth noise)
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * noise(p);
      p *= 2.03;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    // Aspect-corrected uv centered at 0
    vec2 uv = vUv * 2.0 - 1.0;
    // Slight horizontal stretch so bands read as wide horizontal ribbons
    uv.x *= 1.6;

    float t = uTime * 0.06;

    // Domain warp — two fBM samples offset the coord we sample the
    // primary noise at. Produces the characteristic "flowing dye" look.
    vec2 q = vec2(
      fbm(uv + vec2(t * 0.7, t * 0.3)),
      fbm(uv + vec2(t * 0.4, -t * 0.5))
    );
    vec2 r = vec2(
      fbm(uv + q * 1.8 + vec2(1.7, 9.2) + t),
      fbm(uv + q * 1.5 + vec2(8.3, 2.8) + t * 0.7)
    );
    float f = fbm(uv * 1.4 + r);

    // Two-tone mix, with darker floor pulling the low end nearly black
    vec3 col = mix(uColorDark, uColorB, smoothstep(0.15, 0.55, f));
    col = mix(col, uColorA,     smoothstep(0.45, 0.85, f));

    // Vertical falloff — bands feel like they belong to the sky, not
    // the floor. Bottom fades toward the dark tone.
    float vFade = smoothstep(-1.0, 0.35, uv.y);
    col = mix(uColorDark, col, vFade);

    col *= uIntensity;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function AuroraBackplane({ stateRef, reduced }: {
  stateRef: MutableRefObject<SceneState>;
  reduced: boolean;
}) {
  const [material] = useState(
    () =>
      new THREE.ShaderMaterial({
        depthWrite: false,
        uniforms: {
          uTime:      { value: 0 },
          uColorA:    { value: new THREE.Color(SECTION_AURORA["cold-open"].a) },
          uColorB:    { value: new THREE.Color(SECTION_AURORA["cold-open"].b) },
          uColorDark: { value: new THREE.Color("#040610") },
          uIntensity: { value: 1.0 },
        },
        vertexShader:   AURORA_VERT,
        fragmentShader: AURORA_FRAG,
      })
  );
  const [targetA] = useState(() => new THREE.Color(SECTION_AURORA["cold-open"].a));
  const [targetB] = useState(() => new THREE.Color(SECTION_AURORA["cold-open"].b));

  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  // eslint-disable-next-line react-hooks/immutability
  useFrame((_, delta) => {
    const tint = SECTION_AURORA[stateRef.current.section];
    targetA.set(tint.a);
    targetB.set(tint.b);

    const lerpFactor = 1 - Math.pow(0.04, delta);
    material.uniforms.uColorA.value.lerp(targetA, lerpFactor);
    material.uniforms.uColorB.value.lerp(targetB, lerpFactor);

    if (!reduced) {
      // eslint-disable-next-line react-hooks/immutability
      material.uniforms.uTime.value += delta;
    }
  });

  return (
    <mesh position={[0, 0, -22]}>
      <planeGeometry args={[80, 50]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

// A very small dust field in front of the aurora — gives the consoles
// something to be lit against. Not the star of the show; the aurora is.
type DustBuild = { geometry: THREE.BufferGeometry; material: THREE.PointsMaterial };

function buildDust(reduced: boolean): DustBuild {
  const count = reduced ? 80 : 220;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 22;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: "#e8dcb8",
    size: 0.035,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return { geometry, material };
}

function DustLayer({ reduced }: { reduced: boolean }) {
  const [assets, setAssets] = useState<DustBuild | null>(null);

  useEffect(() => {
    const built = buildDust(reduced);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssets(built);
    return () => {
      built.geometry.dispose();
      built.material.dispose();
    };
  }, [reduced]);

  if (!assets) return null;
  return <points geometry={assets.geometry} material={assets.material} />;
}

// The aurora reflects on the consoles via colored rim + fill lights
// that lerp to match the current section's aurora hue.
function AuroraLighting({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  const rimRef = useRef<THREE.PointLight>(null);
  const fillRef = useRef<THREE.PointLight>(null);
  const [rimTarget] = useState(() => new THREE.Color(SECTION_AURORA["cold-open"].a));
  const [fillTarget] = useState(() => new THREE.Color(SECTION_AURORA["cold-open"].b));

  useFrame((_, delta) => {
    const tint = SECTION_AURORA[stateRef.current.section];
    rimTarget.set(tint.a).offsetHSL(0, 0.1, 0.3);
    fillTarget.set(tint.b).offsetHSL(0, 0.1, 0.4);
    const lerpFactor = 1 - Math.pow(0.04, delta);
    if (rimRef.current) rimRef.current.color.lerp(rimTarget, lerpFactor);
    if (fillRef.current) fillRef.current.color.lerp(fillTarget, lerpFactor);
  });

  return (
    <>
      <ambientLight intensity={0.5} color="#d0d8e6" />
      <pointLight ref={rimRef}  position={[0,  2, -6]} intensity={2.4} distance={16} color="#4a7aaa" />
      <pointLight ref={fillRef} position={[0,  4,  6]} intensity={1.5} distance={14} color="#e6c0a0" />
      <pointLight position={[-4, -1, 4]} intensity={0.8} color="#c8d8e6" distance={9} />
    </>
  );
}

interface BackgroundVariantSceneProps {
  stateRef: MutableRefObject<SceneState>;
}

export function AuroraFieldDom() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{
        zIndex: -2,
        // Deep midnight blue floor beneath the aurora. Visible only in
        // the very brief moment before the canvas takes over.
        background:
          "linear-gradient(180deg, #050a1a 0%, #030608 100%)",
      }}
    />
  );
}

export function AuroraFieldScene({ stateRef }: BackgroundVariantSceneProps) {
  const reduced = usePrefersReducedMotion();
  return (
    <>
      <AuroraLighting stateRef={stateRef} />
      <AuroraBackplane stateRef={stateRef} reduced={reduced} />
      <DustLayer reduced={reduced} />
    </>
  );
}

export function AuroraFieldEffects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={0.85} luminanceThreshold={0.4} luminanceSmoothing={0.85} mipmapBlur />
      <ChromaticAberration
        offset={new THREE.Vector2(0.0008, 0.0008)}
        radialModulation={false}
        modulationOffset={0}
      />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.045} />
      <Vignette darkness={0.55} offset={0.28} />
    </EffectComposer>
  );
}
