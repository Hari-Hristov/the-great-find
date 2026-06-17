import { useEffect, useRef } from "react";

// Clean, readable silhouettes at 100x100 viewBox
const MARIO_PATH =
  // Hat brim + body — recognizable mushroom kingdom guy
  "M30,42 L30,35 C30,22 40,14 50,14 C60,14 70,22 70,35 L70,42 L75,42 L75,50 L65,50 L65,44 L60,44 L60,50 L40,50 L40,44 L35,44 L35,50 L25,50 L25,42 Z " +
  "M35,68 L35,52 L65,52 L65,68 L60,75 L40,75 Z " +
  "M38,75 L35,86 L25,86 L28,75 Z " +
  "M62,75 L65,86 L75,86 L72,75 Z " +
  "M38,30 C38,27 41,25 44,26 L44,32 L38,32 Z " +
  "M62,30 C62,27 59,25 56,26 L56,32 L62,32 Z " +
  "M44,36 L56,36 L56,40 L44,40 Z";

const PIKACHU_PATH =
  // Rounder head, ear spikes, chubby cheeks
  "M32,15 L26,6 L30,18 Z " +       // left ear
  "M68,15 L74,6 L70,18 Z " +       // right ear
  "M25,35 C25,20 35,12 50,12 C65,12 75,20 75,35 C75,52 65,62 50,62 C35,62 25,52 25,35 Z " + // head
  "M33,38 C33,35 36,33 39,33 C42,33 44,35 44,38 C44,41 42,43 39,43 C36,43 33,41 33,38 Z " + // left eye
  "M56,38 C56,35 58,33 61,33 C64,33 67,35 67,38 C67,41 64,43 61,43 C58,43 56,41 56,38 Z " + // right eye
  "M28,44 C24,42 20,46 22,50 C24,56 32,56 36,52 Z " +  // left cheek
  "M72,44 C76,42 80,46 78,50 C76,56 68,56 64,52 Z " +  // right cheek
  "M44,50 L50,55 L56,50 Z " +       // mouth
  "M40,62 L35,80 L30,88 L38,88 L44,75 L50,78 L56,75 L62,88 L70,88 L65,80 L60,62 Z " + // body+tail
  "M20,68 L35,65 L32,75 L18,78 Z " + // left arm
  "M80,68 L65,65 L68,75 L82,78 Z";   // right arm

const LINK_PATH =
  // Pointed hat, tunic, shield hint
  "M50,8 L44,28 L56,28 Z " +         // pointy hat
  "M38,28 L62,28 L66,36 L60,36 L60,58 L56,62 L44,62 L40,58 L40,36 L34,36 Z " + // tunic body
  "M34,36 L26,40 L24,56 L32,58 L40,52 Z " + // shield left
  "M40,62 L36,80 L44,80 L44,70 Z " + // left leg
  "M60,62 L64,80 L56,80 L56,70 Z " + // right leg
  "M60,36 L70,32 L74,22 L66,20 L62,28 Z " + // sword arm
  "M50,8 C44,10 38,14 38,22 C38,28 44,30 50,30 C56,30 62,28 62,22 C62,14 56,10 50,8 Z"; // head under hat

const KIRBY_PATH =
  // Classic round Kirby — circle body, little feet, stubby arms
  "M50,15 C30,15 15,30 15,50 C15,70 30,82 50,82 C70,82 85,70 85,50 C85,30 70,15 50,15 Z " + // body
  "M36,44 C36,40 39,38 42,38 C45,38 48,40 48,44 C48,48 45,50 42,50 C39,50 36,48 36,44 Z " + // left eye
  "M52,44 C52,40 55,38 58,38 C61,38 64,40 64,44 C64,48 61,50 58,50 C55,50 52,48 52,44 Z " + // right eye
  "M40,58 C40,54 44,52 50,52 C56,52 60,54 60,58 Z " +  // mouth
  "M15,50 C10,46 8,56 12,60 L15,58 Z " + // left arm
  "M85,50 C90,46 92,56 88,60 L85,58 Z " + // right arm
  "M36,82 L32,94 L40,94 L44,84 Z " +  // left foot
  "M64,82 L68,94 L60,94 L56,84 Z";    // right foot

const HOLLOW_KNIGHT_PATH =
  // Knight with horns, cloak, nail weapon
  "M38,8 L34,2 L38,14 Z " +           // left horn
  "M62,8 L66,2 L62,14 Z " +           // right horn
  "M38,14 C38,10 44,8 50,8 C56,8 62,10 62,14 L64,24 L36,24 Z " + // head/mask
  "M36,24 L30,30 L28,42 L34,44 L36,36 L36,60 L64,60 L64,36 L66,44 L72,42 L70,30 L64,24 Z " + // body/cloak
  "M36,60 L30,80 L38,80 L42,65 Z " +  // left leg
  "M64,60 L70,80 L62,80 L58,65 Z " +  // right leg
  "M36,42 L16,52 L14,60 L8,58 L10,48 L28,36 Z " + // nail/sword
  "M42,28 C42,26 44,24 46,25 L47,30 L42,30 Z " + // left eye glow
  "M58,28 C58,26 56,24 54,25 L53,30 L58,30 Z";   // right eye glow

const SAMUS_PATH =
  // Power suit helmet + arm cannon
  "M50,10 C34,10 24,22 24,36 C24,50 34,58 50,58 C66,58 76,50 76,36 C76,22 66,10 50,10 Z " + // helmet
  "M36,38 C36,34 40,32 44,32 C44,36 44,40 42,42 C40,42 36,42 36,38 Z " + // visor left
  "M64,38 C64,34 60,32 56,32 C56,36 56,40 58,42 C60,42 64,42 64,38 Z " + // visor right
  "M42,32 L58,32 L58,42 L42,42 Z " + // visor center
  "M38,58 L34,72 L30,88 L42,88 L46,72 L50,76 L54,72 L58,88 L70,88 L66,72 L62,58 Z " + // legs
  "M24,50 L14,54 L10,66 L6,64 L8,50 L20,44 Z " + // arm cannon
  "M6,64 L2,68 L4,72 L10,70 L10,66 Z"; // cannon tip

const CHARACTERS: Array<{
  id: string; x: number; y: number; size: number; opacity: number; rotation: number;
  color: string; driftX: number; driftY: number; driftSpeed: number; path: string;
}> = [
  { id: "mario",   x: 6,  y: 10, size: 110, opacity: 0.22, rotation: -6,  color: "#ff6b6b", driftX: 0.4,  driftY: 0.25, driftSpeed: 0.0004,  path: MARIO_PATH },
  { id: "pikachu", x: 76, y: 8,  size: 120, opacity: 0.22, rotation: 8,   color: "#fbbf24", driftX: -0.3, driftY: 0.35, driftSpeed: 0.00045, path: PIKACHU_PATH },
  { id: "link",    x: 83, y: 50, size: 105, opacity: 0.18, rotation: 5,   color: "#34d399", driftX: -0.25,driftY: -0.3, driftSpeed: 0.00035, path: LINK_PATH },
  { id: "kirby",   x: 10, y: 58, size: 115, opacity: 0.24, rotation: -4,  color: "#f9a8d4", driftX: 0.3,  driftY: -0.25,driftSpeed: 0.00042, path: KIRBY_PATH },
  { id: "hollow",  x: 4,  y: 32, size: 100, opacity: 0.16, rotation: 3,   color: "#a78bfa", driftX: 0.22, driftY: 0.2,  driftSpeed: 0.0003,  path: HOLLOW_KNIGHT_PATH },
  { id: "samus",   x: 70, y: 72, size: 108, opacity: 0.18, rotation: -10, color: "#7eb8ff", driftX: -0.28,driftY: -0.18,driftSpeed: 0.00038, path: SAMUS_PATH },
];

export function CharacterBackground() {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const tick = (ts: number) => {
      CHARACTERS.forEach((ch, i) => {
        const el = refs.current[i];
        if (!el) return;
        const ox = Math.sin(ts * ch.driftSpeed) * ch.driftX;
        const oy = Math.cos(ts * ch.driftSpeed * 0.8) * ch.driftY;
        el.style.transform = `translate(${ox}vw, ${oy}vh) rotate(${ch.rotation}deg)`;
      });
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current !== null) cancelAnimationFrame(animRef.current); };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0" style={{ zIndex: 1 }}>
      {CHARACTERS.map((ch, i) => (
        <div
          key={ch.id}
          ref={(el) => { refs.current[i] = el; }}
          style={{
            position: "absolute",
            left: `${ch.x}%`,
            top: `${ch.y}%`,
            opacity: ch.opacity,
            willChange: "transform",
            transformOrigin: "center center",
            transform: `rotate(${ch.rotation}deg)`,
          }}
        >
          <svg
            width={ch.size}
            height={ch.size}
            viewBox="0 0 100 100"
            fill={ch.color}
            style={{ filter: `drop-shadow(0 0 12px ${ch.color}66)` }}
          >
            <path d={ch.path} />
          </svg>
        </div>
      ))}
    </div>
  );
}
