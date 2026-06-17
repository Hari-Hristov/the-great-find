import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import type { MutableRefObject } from "react";
import type { SceneState } from "./sceneState";

export function SceneEffects({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  const offsetRef = useRef(new THREE.Vector2(0.0003, 0.0003));

  useFrame(() => {
    const { glitchActive } = stateRef.current;
    const intensity = glitchActive ? 0.006 : 0.0003;
    offsetRef.current.set(intensity, intensity);
  });

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={0.6}
        luminanceThreshold={0.5}
        luminanceSmoothing={0.7}
        mipmapBlur
      />
      <ChromaticAberration
        offset={offsetRef.current}
        blendFunction={BlendFunction.NORMAL}
        radialModulation={false}
        modulationOffset={0}
      />
      <Vignette darkness={0.5} offset={0.3} />
    </EffectComposer>
  );
}
