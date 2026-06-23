import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { MutableRefObject } from "react";
import type { SceneState } from "./sceneState";
import { CAMERA_BY_SECTION } from "./scrollDriver";

// The FOV values in CAMERA_BY_SECTION were tuned at this viewport height.
// We scale the target FOV so the vertical composition is identical at any screen size.
const REFERENCE_HEIGHT = 900;

const _pos = new THREE.Vector3();
const _target = new THREE.Vector3();

function scaledFov(designFovDeg: number, viewportHeight: number): number {
  const halfFovRad = (designFovDeg * Math.PI) / 360;
  const scaledHalfRad = Math.atan(Math.tan(halfFovRad) * (REFERENCE_HEIGHT / viewportHeight));
  return (scaledHalfRad * 360) / Math.PI;
}

export function ScrollCameraRig({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  const currentPos = useRef(new THREE.Vector3(0, 0, 6));
  const currentTarget = useRef(new THREE.Vector3(0, 0, 0));
  const currentFov = useRef(45);
  const { size } = useThree();

  useFrame(({ camera }, delta) => {
    const { section, sectionProgress } = stateRef.current;
    const cfg = CAMERA_BY_SECTION[section];

    _pos.set(cfg.position[0], cfg.position[1], cfg.position[2]);
    _target.set(cfg.target[0], cfg.target[1], cfg.target[2]);

    const lerpFactor = 1 - Math.pow(0.025, delta);

    currentPos.current.lerp(_pos, lerpFactor);
    camera.position.copy(currentPos.current);

    currentTarget.current.lerp(_target, lerpFactor);
    camera.lookAt(currentTarget.current);

    const cam = camera as THREE.PerspectiveCamera;
    const targetFov = scaledFov(cfg.fov, size.height);
    currentFov.current += (targetFov - currentFov.current) * lerpFactor;
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
