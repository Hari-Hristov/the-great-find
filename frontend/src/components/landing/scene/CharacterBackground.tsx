import { useRef } from "react";
import { Float, Html } from "@react-three/drei";
import type { Group } from "three";
import { ModelWithFallback } from "./ModelLoader";

// SVG fallback paths — shown if a GLB fails to load
const MARIO_PATH =
  "M30,42 L30,35 C30,22 40,14 50,14 C60,14 70,22 70,35 L70,42 L75,42 L75,50 L65,50 L65,44 L60,44 L60,50 L40,50 L40,44 L35,44 L35,50 L25,50 L25,42 Z " +
  "M35,68 L35,52 L65,52 L65,68 L60,75 L40,75 Z " +
  "M38,75 L35,86 L25,86 L28,75 Z " +
  "M62,75 L65,86 L75,86 L72,75 Z " +
  "M38,30 C38,27 41,25 44,26 L44,32 L38,32 Z " +
  "M62,30 C62,27 59,25 56,26 L56,32 L62,32 Z " +
  "M44,36 L56,36 L56,40 L44,40 Z";

const PIKACHU_PATH =
  "M32,15 L26,6 L30,18 Z " +
  "M68,15 L74,6 L70,18 Z " +
  "M25,35 C25,20 35,12 50,12 C65,12 75,20 75,35 C75,52 65,62 50,62 C35,62 25,52 25,35 Z " +
  "M33,38 C33,35 36,33 39,33 C42,33 44,35 44,38 C44,41 42,43 39,43 C36,43 33,41 33,38 Z " +
  "M56,38 C56,35 58,33 61,33 C64,33 67,35 67,38 C67,41 64,43 61,43 C58,43 56,41 56,38 Z " +
  "M28,44 C24,42 20,46 22,50 C24,56 32,56 36,52 Z " +
  "M72,44 C76,42 80,46 78,50 C76,56 68,56 64,52 Z " +
  "M44,50 L50,55 L56,50 Z " +
  "M40,62 L35,80 L30,88 L38,88 L44,75 L50,78 L56,75 L62,88 L70,88 L65,80 L60,62 Z " +
  "M20,68 L35,65 L32,75 L18,78 Z " +
  "M80,68 L65,65 L68,75 L82,78 Z";

const LINK_PATH =
  "M50,8 L44,28 L56,28 Z " +
  "M38,28 L62,28 L66,36 L60,36 L60,58 L56,62 L44,62 L40,58 L40,36 L34,36 Z " +
  "M34,36 L26,40 L24,56 L32,58 L40,52 Z " +
  "M40,62 L36,80 L44,80 L44,70 Z " +
  "M60,62 L64,80 L56,80 L56,70 Z " +
  "M60,36 L70,32 L74,22 L66,20 L62,28 Z " +
  "M50,8 C44,10 38,14 38,22 C38,28 44,30 50,30 C56,30 62,28 62,22 C62,14 56,10 50,8 Z";

const KIRBY_PATH =
  "M50,15 C30,15 15,30 15,50 C15,70 30,82 50,82 C70,82 85,70 85,50 C85,30 70,15 50,15 Z " +
  "M36,44 C36,40 39,38 42,38 C45,38 48,40 48,44 C48,48 45,50 42,50 C39,50 36,48 36,44 Z " +
  "M52,44 C52,40 55,38 58,38 C61,38 64,40 64,44 C64,48 61,50 58,50 C55,50 52,48 52,44 Z " +
  "M40,58 C40,54 44,52 50,52 C56,52 60,54 60,58 Z " +
  "M15,50 C10,46 8,56 12,60 L15,58 Z " +
  "M85,50 C90,46 92,56 88,60 L85,58 Z " +
  "M36,82 L32,94 L40,94 L44,84 Z " +
  "M64,82 L68,94 L60,94 L56,84 Z";

const HOLLOW_KNIGHT_PATH =
  "M38,8 L34,2 L38,14 Z " +
  "M62,8 L66,2 L62,14 Z " +
  "M38,14 C38,10 44,8 50,8 C56,8 62,10 62,14 L64,24 L36,24 Z " +
  "M36,24 L30,30 L28,42 L34,44 L36,36 L36,60 L64,60 L64,36 L66,44 L72,42 L70,30 L64,24 Z " +
  "M36,60 L30,80 L38,80 L42,65 Z " +
  "M64,60 L70,80 L62,80 L58,65 Z " +
  "M36,42 L16,52 L14,60 L8,58 L10,48 L28,36 Z " +
  "M42,28 C42,26 44,24 46,25 L47,30 L42,30 Z " +
  "M58,28 C58,26 56,24 54,25 L53,30 L58,30 Z";

const SAMUS_PATH =
  "M50,10 C34,10 24,22 24,36 C24,50 34,58 50,58 C66,58 76,50 76,36 C76,22 66,10 50,10 Z " +
  "M36,38 C36,34 40,32 44,32 C44,36 44,40 42,42 C40,42 36,42 36,38 Z " +
  "M64,38 C64,34 60,32 56,32 C56,36 56,40 58,42 C60,42 64,42 64,38 Z " +
  "M42,32 L58,32 L58,42 L42,42 Z " +
  "M38,58 L34,72 L30,88 L42,88 L46,72 L50,76 L54,72 L58,88 L70,88 L66,72 L62,58 Z " +
  "M24,50 L14,54 L10,66 L6,64 L8,50 L20,44 Z " +
  "M6,64 L2,68 L4,72 L10,70 L10,66 Z";

function SvgFallback({ svgPath, color }: { svgPath: string; color: string }) {
  return (
    <Html center>
      <svg
        width={90}
        height={90}
        viewBox="0 0 100 100"
        fill={color}
        style={{ filter: `drop-shadow(0 0 12px ${color}66)`, opacity: 0.22 }}
      >
        <path d={svgPath} />
      </svg>
    </Html>
  );
}

interface CharacterDef {
  id: string;
  glb: string;
  svgPath: string;
  color: string;
  position: [number, number, number];
  scale: number;
  rotationY: number;
  driftSpeed: number;
  floatSpeed: number;
  floatIntensity: number;
  hideMeshes?: string[];
  initialRotationY?: number;
  useSvg?: boolean;
}

const CHARACTERS: CharacterDef[] = [
  {
    id: "mario",
    glb: "./models/mario_obj.glb",
    svgPath: MARIO_PATH,
    color: "#ff6b6b",
    position: [-4.5, 1.2, -8],
    scale: 0.23,
    rotationY: 0.3,
    driftSpeed: 0.06,
    floatSpeed: 1.4,
    floatIntensity: 0.3,
    // Object_4 and Object_7 are the display base/platform, not part of the character
    hideMeshes: ["Object_4", "Object_7"],
  },
  {
    id: "pikachu",
    glb: "./models/pikachu.glb",
    svgPath: PIKACHU_PATH,
    color: "#fbbf24",
    position: [4.2, 1.8, -9],
    scale: 0.12,
    rotationY: -0.4,
    driftSpeed: 0.05,
    floatSpeed: 1.6,
    floatIntensity: 0.35,
  },
  {
    id: "link",
    glb: "./models/link_the_legend_of_zelda_breath_of_the_wild.glb",
    svgPath: LINK_PATH,
    color: "#34d399",
    position: [5.5, -0.5, -8],
    scale: 0.98,
    rotationY: -0.5,
    driftSpeed: 0.04,
    floatSpeed: 1.1,
    floatIntensity: 0.25,
    initialRotationY: Math.PI * 0.75,
  },
  {
    id: "kirby",
    glb: "./models/kirby.glb",
    svgPath: KIRBY_PATH,
    color: "#f9a8d4",
    position: [-4, -1.8, -7],
    scale: 0.13,
    rotationY: 0.5,
    driftSpeed: 0.055,
    floatSpeed: 1.8,
    floatIntensity: 0.4,
  },
  {
    id: "hollow",
    glb: "./models/hollow_knight.glb",
    svgPath: HOLLOW_KNIGHT_PATH,
    color: "#a78bfa",
    position: [-2.5, 2.2, -9],
    scale: 2.07,
    rotationY: 0.2,
    driftSpeed: 0.035,
    floatSpeed: 0.9,
    floatIntensity: 0.2,
    useSvg: true,
  },
  {
    id: "samus",
    glb: "./models/power_suit_samus.glb",
    svgPath: SAMUS_PATH,
    color: "#7eb8ff",
    position: [3.8, -1.8, -8],
    scale: 0.21,
    rotationY: -0.3,
    driftSpeed: 0.045,
    floatSpeed: 1.2,
    floatIntensity: 0.28,
    initialRotationY: Math.PI * 0.6,
  },
];

function CharacterModel({ def }: { def: CharacterDef }) {
  const groupRef = useRef<Group>(null);

  const fallback = <SvgFallback svgPath={def.svgPath} color={def.color} />;

  return (
    <Float speed={def.floatSpeed} floatIntensity={def.floatIntensity} rotationIntensity={0.03}>
      <group ref={groupRef} position={def.position} rotation={[0, def.initialRotationY ?? 0, 0]}>
        {def.useSvg ? fallback : (
          <ModelWithFallback
            path={def.glb}
            scale={def.scale}
            hideMeshes={def.hideMeshes}
            fallback={fallback}
          />
        )}
      </group>
    </Float>
  );
}

export function CharacterBackground() {
  return (
    <>
      {CHARACTERS.map((def) => (
        <CharacterModel key={def.id} def={def} />
      ))}
    </>
  );
}
