import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MutableRefObject } from "react";
import type { SceneState } from "./sceneState";
import { CAMERA_BY_SECTION } from "./scrollDriver";

const _pos = new THREE.Vector3();
const _target = new THREE.Vector3();

export function ScrollCameraRig({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  const currentPos = useRef(new THREE.Vector3(0, 0, 6));
  const currentTarget = useRef(new THREE.Vector3(0, 0, 0));
  const currentFov = useRef(45);

  useFrame(({ camera }, delta) => {
    const { section, sectionProgress } = stateRef.current;
    const cfg = CAMERA_BY_SECTION[section];

    _pos.set(cfg.position[0], cfg.position[1], cfg.position[2]);
    _target.set(cfg.target[0], cfg.target[1], cfg.target[2]);

    // 0.05 base gives a snappier, more responsive camera follow than 0.02
    const lerpFactor = 1 - Math.pow(0.05, delta);

    currentPos.current.lerp(_pos, lerpFactor);
    camera.position.copy(currentPos.current);

    currentTarget.current.lerp(_target, lerpFactor);
    camera.lookAt(currentTarget.current);

    const cam = camera as THREE.PerspectiveCamera;
    currentFov.current += (cfg.fov - currentFov.current) * lerpFactor;
    cam.fov = currentFov.current;
    cam.updateProjectionMatrix();

    camera.rotation.z = THREE.MathUtils.lerp(
      camera.rotation.z,
      sectionProgress * 0.03,
      lerpFactor * 0.5,
    );
  });

  return null;
}
