import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Text3D, Center } from "@react-three/drei";
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

// Variant: Kinetic Type Cyclorama
// Reference DNA: activetheory.net's love of large 3D-extruded type as
// atmosphere + Locomotive-style typographic cyclorama backdrops. The
// section word floats deep in Z, slowly rotating, wireframe-edged,
// gradient-fill. Sections swap the word with a chromatic-split
// "compression" transition. Reads like the credits of a good film.

const SECTION_WORD: Record<SceneState["section"], string> = {
  "cold-open":         "STANDBY",
  "3ds-hero":          "3DS",
  "portal-dive":       "SEARCHING",
  "switch-emergence":  "SWITCH",
  "pivot":             "MATCHED",
  "screen-dive":       "TRACKING",
  "steam-deck":        "STEAM DECK",
  "delivery":          "DELIVERED",
};

const SECTION_TYPE_TINT: Record<SceneState["section"], THREE.ColorRepresentation> = {
  "cold-open":         "#3a5a8a",
  "3ds-hero":          "#4a6aa8",
  "portal-dive":       "#a84aa8",
  "switch-emergence":  "#4a8ac8",
  "pivot":             "#a86ac8",
  "screen-dive":       "#4ac8a8",
  "steam-deck":        "#c8a86a",
  "delivery":          "#e8a848",
};

// Font is served from public/fonts/ — no external CDN dependency.
// (Copied at build-scaffold time from the three-bundled examples.)
const FONT_URL = "/fonts/droid_sans_bold.typeface.json";

// The deep-Z cyclorama word. Two Text3D instances — the current word,
// visible, and the incoming word, positioned below and hidden. On
// section change, the current one slides down + fades out while the
// incoming slides in from above.
function CycloramaText({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  const groupRef = useRef<THREE.Group>(null);
  const currentGroupRef = useRef<THREE.Group>(null);
  const nextGroupRef = useRef<THREE.Group>(null);

  const [currentSection, setCurrentSection] = useState<SceneState["section"]>("cold-open");
  const [nextSection, setNextSection] = useState<SceneState["section"] | null>(null);
  const transitionRef = useRef(0); // 0..1 progress of the crossfade slide

  // Section change: kicks off a slide+fade transition to nextSection
  useFrame((_, delta) => {
    const live = stateRef.current.section;
    if (live !== currentSection && live !== nextSection) {
      setNextSection(live);
      transitionRef.current = 0;
    }

    if (nextSection) {
      transitionRef.current = Math.min(1, transitionRef.current + delta * 1.1);
      const t = transitionRef.current;
      // Ease-out-quart
      const eased = 1 - Math.pow(1 - t, 4);

      // Current: slides down and fades out
      if (currentGroupRef.current) {
        currentGroupRef.current.position.y = -eased * 3.5;
        const scale = 1 - eased * 0.15;
        currentGroupRef.current.scale.setScalar(scale);
        currentGroupRef.current.traverse((c) => {
          const mesh = c as THREE.Mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
          if (mat && "opacity" in mat) {
            mat.transparent = true;
            mat.opacity = 1 - eased;
          }
        });
      }

      // Next: slides in from above and fades in
      if (nextGroupRef.current) {
        nextGroupRef.current.position.y = (1 - eased) * 3.5;
        const scale = 0.85 + eased * 0.15;
        nextGroupRef.current.scale.setScalar(scale);
        nextGroupRef.current.traverse((c) => {
          const mesh = c as THREE.Mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
          if (mat && "opacity" in mat) {
            mat.transparent = true;
            mat.opacity = eased;
          }
        });
      }

      if (transitionRef.current >= 1) {
        setCurrentSection(nextSection);
        setNextSection(null);
      }
    }

    // Ambient slow rotation — the cyclorama is always alive
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.04;
    }
  });

  const currentColor = SECTION_TYPE_TINT[currentSection];
  const nextColor = nextSection ? SECTION_TYPE_TINT[nextSection] : currentColor;

  return (
    <group ref={groupRef} position={[0, 0, -18]}>
      <group ref={currentGroupRef}>
        <Center>
          <Text3D
            font={FONT_URL}
            size={2.0}
            height={0.35}
            curveSegments={6}
            bevelEnabled
            bevelThickness={0.02}
            bevelSize={0.015}
            bevelSegments={2}
          >
            {SECTION_WORD[currentSection]}
            <meshStandardMaterial
              color={currentColor}
              emissive={currentColor}
              emissiveIntensity={0.55}
              metalness={0.6}
              roughness={0.35}
              transparent
              opacity={nextSection ? 1 : 1}
            />
          </Text3D>
        </Center>
      </group>

      {nextSection && (
        <group ref={nextGroupRef}>
          <Center>
            <Text3D
              font={FONT_URL}
              size={2.0}
              height={0.35}
              curveSegments={6}
              bevelEnabled
              bevelThickness={0.02}
              bevelSize={0.015}
              bevelSegments={2}
            >
              {SECTION_WORD[nextSection]}
              <meshStandardMaterial
                color={nextColor}
                emissive={nextColor}
                emissiveIntensity={0.55}
                metalness={0.6}
                roughness={0.35}
                transparent
                opacity={0}
              />
            </Text3D>
          </Center>
        </group>
      )}
    </group>
  );
}

// A thin star field behind the type — very sparse, cool white, gives
// the cyclorama depth. Feels like credits over deep space.
type StarBuild = { geometry: THREE.BufferGeometry; material: THREE.PointsMaterial };

function buildStars(reduced: boolean): StarBuild {
  const count = reduced ? 120 : 400;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 40;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 22;
    positions[i * 3 + 2] = -24 - Math.random() * 8;
    sizes[i] = 0.02 + Math.random() * 0.05;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    color: "#dce8ff",
    size: 0.05,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return { geometry, material };
}

function StarField({ reduced }: { reduced: boolean }) {
  const [assets, setAssets] = useState<StarBuild | null>(null);
  const pointsRef = useRef<THREE.Points>(null);

  useEffect(() => {
    const built = buildStars(reduced);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssets(built);
    return () => {
      built.geometry.dispose();
      built.material.dispose();
    };
  }, [reduced]);

  useFrame((_, delta) => {
    if (!pointsRef.current || reduced) return;
    // Very slow parallax rotation — sells the depth of the cyclorama
    pointsRef.current.rotation.y += delta * 0.008;
  });

  if (!assets) return null;
  return <points ref={pointsRef} geometry={assets.geometry} material={assets.material} />;
}

// Foreground floating dust — small warm specks in front of the type,
// reads like film grain that has weight.
function ForegroundDust({ reduced }: { reduced: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);

  const { geometry, material } = useMemo(() => {
    // Note: this useMemo is intentionally seed-free — random values are
    // resolved inside useEffect below so we avoid impurity in render.
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.PointsMaterial({
      color: "#e8d8a8",
      size: 0.045,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: geo, material: mat };
  }, []);

  useEffect(() => {
    const count = reduced ? 60 : 160;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 2;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [reduced, geometry, material]);

  useFrame(({ clock }) => {
    if (!pointsRef.current || reduced) return;
    // Slow orbital drift
    pointsRef.current.rotation.y = clock.elapsedTime * 0.02;
    pointsRef.current.position.y = Math.sin(clock.elapsedTime * 0.15) * 0.2;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

function CycloramaLighting({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  const backRef = useRef<THREE.PointLight>(null);
  const [target] = useState(() => new THREE.Color(SECTION_TYPE_TINT["cold-open"]));

  useFrame((_, delta) => {
    target.set(SECTION_TYPE_TINT[stateRef.current.section]);
    target.offsetHSL(0, 0.1, 0.3);
    const lerpFactor = 1 - Math.pow(0.04, delta);
    if (backRef.current) backRef.current.color.lerp(target, lerpFactor);
  });

  return (
    <>
      <ambientLight intensity={0.4} color="#c8d0e8" />
      {/* Key light lit the consoles from the front */}
      <pointLight position={[3, 4, 5]}  intensity={1.8} color="#ffffff" distance={12} />
      <pointLight position={[-4, -1, 4]} intensity={0.9} color="#a8b8d0" distance={10} />
      {/* Back light — the color of the section, silhouettes the consoles
          against the deep-Z type. */}
      <pointLight ref={backRef} position={[0, 0, -12]} intensity={2.8} distance={22} color={SECTION_TYPE_TINT["cold-open"]} />
    </>
  );
}

interface BackgroundVariantSceneProps {
  stateRef: MutableRefObject<SceneState>;
}

export function KineticTypeDom() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{
        zIndex: -2,
        // Very deep near-black with a subtle graphite lift. The section
        // color washes onto this via the back light and Bloom.
        background:
          "radial-gradient(ellipse 90% 65% at 50% 50%, #0a0c14 0%, #050609 55%, #020204 100%)",
      }}
    />
  );
}

export function KineticTypeScene({ stateRef }: BackgroundVariantSceneProps) {
  const reduced = usePrefersReducedMotion();
  return (
    <>
      <CycloramaLighting stateRef={stateRef} />
      <StarField reduced={reduced} />
      <CycloramaText stateRef={stateRef} />
      <ForegroundDust reduced={reduced} />
    </>
  );
}

export function KineticTypeEffects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={1.05} luminanceThreshold={0.4} luminanceSmoothing={0.88} mipmapBlur />
      <ChromaticAberration
        offset={new THREE.Vector2(0.0012, 0.0012)}
        radialModulation={false}
        modulationOffset={0}
      />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.05} />
      <Vignette darkness={0.65} offset={0.25} />
    </EffectComposer>
  );
}
