import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Float, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { ModelWithFallback } from "./ModelLoader";

function Procedural3DS() {
  const DEG = Math.PI / 180;
  return (
    <>
      {/* Bottom half — controls base */}
      <group>
        <RoundedBox args={[1.4, 1.0, 0.18]} radius={0.06} smoothness={4} position={[0, -0.55, 0]}>
          <meshStandardMaterial color="#1a1a2e" roughness={0.4} metalness={0.6} />
        </RoundedBox>
        {/* bottom screen */}
        <mesh position={[0, -0.38, 0.1]}>
          <planeGeometry args={[0.85, 0.6]} />
          <meshStandardMaterial color="#0a0a1a" emissive="#0a2a4a" emissiveIntensity={0.5} />
        </mesh>
        {/* d-pad */}
        <mesh position={[-0.35, -0.72, 0.1]}>
          <cylinderGeometry args={[0.1, 0.1, 0.02, 8]} />
          <meshStandardMaterial color="#222233" roughness={0.8} />
        </mesh>
        {/* ABXY buttons */}
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

      {/* Hinge */}
      <mesh position={[0, -0.03, 0]}>
        <boxGeometry args={[1.44, 0.06, 0.2]} />
        <meshStandardMaterial color="#111120" roughness={0.6} metalness={0.4} />
      </mesh>

      {/* Top half lid — ~120° open toward viewer */}
      <group position={[0, -0.03, 0]} rotation={[-120 * DEG, 0, 0]}>
        <RoundedBox args={[1.4, 1.0, 0.14]} radius={0.06} smoothness={4} position={[0, 0.53, 0]}>
          <meshStandardMaterial color="#1a1a2e" roughness={0.4} metalness={0.6} />
        </RoundedBox>
        {/* top screen — faces forward (same side as bottom screen) */}
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
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.12;
  });

  if (!visible) return null;

  return (
    <Float speed={1.4} rotationIntensity={0.15} floatIntensity={0.4}>
      <group ref={groupRef}>
        <ModelWithFallback
          path="/models/3ds.glb"
          scale={1}
          fallback={<Procedural3DS />}
        />
      </group>
    </Float>
  );
}

export function ConsoleSwitch({ visible }: { visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.1;
  });

  if (!visible) return null;

  return (
    <Float speed={1.2} rotationIntensity={0.1} floatIntensity={0.35}>
      <group ref={groupRef}>
        <ModelWithFallback
          path="/models/switch.glb"
          scale={1}
          fallback={<ProceduralSwitch />}
        />
      </group>
    </Float>
  );
}

export function ConsoleSteamDeck({ visible }: { visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.08;
  });

  if (!visible) return null;

  return (
    <Float speed={1.0} rotationIntensity={0.08} floatIntensity={0.3}>
      <group ref={groupRef}>
        <ModelWithFallback
          path="/models/steam-deck.glb"
          scale={1}
          fallback={<ProceduralSteamDeck />}
        />
      </group>
    </Float>
  );
}
