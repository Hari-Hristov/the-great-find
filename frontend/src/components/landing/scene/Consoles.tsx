import { RoundedBox, useGLTF } from "@react-three/drei";
import { ModelWithFallback } from "./ModelLoader";

function Procedural3DS() {
  const DEG = Math.PI / 180;
  return (
    <>
      <group>
        <RoundedBox args={[1.4, 1.0, 0.18]} radius={0.06} smoothness={4} position={[0, -0.55, 0]}>
          <meshStandardMaterial color="#1a1a2e" roughness={0.4} metalness={0.6} />
        </RoundedBox>
        <mesh position={[0, -0.38, 0.1]}>
          <planeGeometry args={[0.85, 0.6]} />
          <meshStandardMaterial color="#0a0a1a" emissive="#0a2a4a" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[-0.35, -0.72, 0.1]}>
          <cylinderGeometry args={[0.1, 0.1, 0.02, 8]} />
          <meshStandardMaterial color="#222233" roughness={0.8} />
        </mesh>
        {([
          [0.28, -0.60],
          [0.38, -0.70],
          [0.28, -0.80],
          [0.18, -0.70],
        ] as [number, number][]).map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0.1]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial
              color={["#cc4444", "#4444cc", "#44cc44", "#cccc44"][i]}
              roughness={0.5}
            />
          </mesh>
        ))}
      </group>

      <mesh position={[0, -0.03, 0]}>
        <boxGeometry args={[1.44, 0.06, 0.2]} />
        <meshStandardMaterial color="#111120" roughness={0.6} metalness={0.4} />
      </mesh>

      <group position={[0, -0.03, 0]} rotation={[-120 * DEG, 0, 0]}>
        <RoundedBox args={[1.4, 1.0, 0.14]} radius={0.06} smoothness={4} position={[0, 0.53, 0]}>
          <meshStandardMaterial color="#1a1a2e" roughness={0.4} metalness={0.6} />
        </RoundedBox>
        <mesh position={[0, 0.53, 0.08]}>
          <planeGeometry args={[1.1, 0.75]} />
          <meshStandardMaterial color="#0a0a1a" emissive="#1a3a6a" emissiveIntensity={0.7} />
        </mesh>
      </group>
    </>
  );
}

function ProceduralSwitch() {
  return (
    <>
      <RoundedBox args={[2.4, 1.4, 0.16]} radius={0.04} smoothness={4}>
        <meshStandardMaterial color="#1c1c1c" roughness={0.35} metalness={0.7} />
      </RoundedBox>
      <mesh position={[0, 0, 0.09]}>
        <planeGeometry args={[1.6, 1.1]} />
        <meshStandardMaterial color="#0a0a14" emissive="#1a3a7a" emissiveIntensity={0.7} />
      </mesh>
      <RoundedBox args={[0.38, 1.4, 0.22]} radius={0.04} smoothness={4} position={[-1.39, 0, 0]}>
        <meshStandardMaterial color="#cc2222" roughness={0.4} metalness={0.5} />
      </RoundedBox>
      <RoundedBox args={[0.38, 1.4, 0.22]} radius={0.04} smoothness={4} position={[1.39, 0, 0]}>
        <meshStandardMaterial color="#1a1a8a" roughness={0.4} metalness={0.5} />
      </RoundedBox>
      <mesh position={[-1.45, 0.32, 0.12]}>
        <cylinderGeometry args={[0.1, 0.1, 0.06, 12]} />
        <meshStandardMaterial color="#111111" roughness={0.7} />
      </mesh>
      <mesh position={[1.45, -0.1, 0.12]}>
        <cylinderGeometry args={[0.1, 0.1, 0.06, 12]} />
        <meshStandardMaterial color="#111111" roughness={0.7} />
      </mesh>
    </>
  );
}

function ProceduralSteamDeck() {
  return (
    <>
      <RoundedBox args={[2.8, 1.6, 0.22]} radius={0.12} smoothness={6}>
        <meshStandardMaterial color="#1a1a22" roughness={0.3} metalness={0.75} />
      </RoundedBox>
      <mesh position={[0, 0, 0.12]}>
        <planeGeometry args={[1.7, 1.1]} />
        <meshStandardMaterial color="#0a0a14" emissive="#2a1a5a" emissiveIntensity={0.65} />
      </mesh>
      <mesh position={[-0.9, -0.2, 0.12]}>
        <circleGeometry args={[0.2, 24]} />
        <meshStandardMaterial color="#222230" roughness={0.8} />
      </mesh>
      <mesh position={[0.9, -0.2, 0.12]}>
        <circleGeometry args={[0.2, 24]} />
        <meshStandardMaterial color="#222230" roughness={0.8} />
      </mesh>
      <mesh position={[-0.7, 0.3, 0.13]}>
        <cylinderGeometry args={[0.11, 0.11, 0.06, 12]} />
        <meshStandardMaterial color="#111118" roughness={0.7} />
      </mesh>
      <mesh position={[0.5, -0.45, 0.13]}>
        <cylinderGeometry args={[0.11, 0.11, 0.06, 12]} />
        <meshStandardMaterial color="#111118" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.06, 0.13]}>
        <circleGeometry args={[0.08, 16]} />
        <meshStandardMaterial color="#3a3a4a" roughness={0.6} />
      </mesh>
    </>
  );
}

export function Console3DS({ visible }: { visible: boolean }) {
  if (!visible) return null;
  // Bbox at scale=1 (no extra rotation): center [0.003, 2.307, -16.41]. At scale=0.227: [0.001, 0.524, -3.725].
  // Negate to put center at world origin. Small X tilt to angle face toward camera.
  // Bbox at scale=1 (no extra rotation): center [0.003, 2.307, -16.41].
  // group position=0 keeps model origin at world origin; model's own center sits at [-3.7z, 0.5y] from origin.
  // scale=0.28, slight X tilt and Y rotation to angle screen face more toward camera.
  return (
    <group position={[0.4, 0.3, 0]}>
      <ModelWithFallback
        path="/models/new_nintendo_3ds_xl.glb"
        scale={0.18}
        rotation={[Math.PI / 2, Math.PI, 0]}
        fallback={<group scale={1.8} position={[0, 0.5, 0]}><Procedural3DS /></group>}
      />
    </group>
  );
}

export function ConsoleSwitch({ visible }: { visible: boolean }) {
  if (!visible) return null;
  // Center offset [0.122, -0.202, 0.003] × scale 10.55 = [1.288, -2.13, 0.032].
  // After rotation Y=π, world-space center = [-1.288, -2.13, -0.032]; negate to re-center.
  return (
    <group position={[1.288, 2.13, 0.032]}>
      <ModelWithFallback
        path="/models/nintendo_switch_console.glb"
        scale={10.55}
        rotation={[0, Math.PI, 0]}
        fallback={<ProceduralSwitch />}
      />
    </group>
  );
}

export function ConsoleSteamDeck({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <ModelWithFallback
      path="/models/steam_deck.glb"
      scale={8.39}
      rotation={[0.45, 0, 0]}
      fallback={<ProceduralSteamDeck />}
    />
  );
}

useGLTF.preload("/models/new_nintendo_3ds_xl.glb");
useGLTF.preload("/models/nintendo_switch_console.glb");
useGLTF.preload("/models/steam_deck.glb");

