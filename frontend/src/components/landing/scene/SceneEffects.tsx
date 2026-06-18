import {
  EffectComposer,
  Bloom,
  Vignette,
} from "@react-three/postprocessing";

export function SceneEffects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={0.6}
        luminanceThreshold={0.5}
        luminanceSmoothing={0.7}
        mipmapBlur
      />
      <Vignette darkness={0.5} offset={0.3} />
    </EffectComposer>
  );
}
