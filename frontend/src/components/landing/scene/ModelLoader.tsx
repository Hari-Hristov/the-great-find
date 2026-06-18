import { Component, Suspense } from "react";
import type { ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import type { Euler, Group } from "three";

interface ErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ModelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {}

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function GLBModel({ path, scale = 1, scaleVec, hideMeshes, rotation }: { path: string; scale?: number; scaleVec?: [number, number, number]; hideMeshes?: string[]; rotation?: [number, number, number] }) {
  const { scene } = useGLTF(path) as { scene: Group };
  if (hideMeshes?.length) {
    scene.traverse((obj) => {
      if (hideMeshes.includes(obj.name)) obj.visible = false;
    });
  }
  const s = scaleVec ?? scale;
  return (
    <group rotation={rotation as unknown as Euler}>
      <primitive object={scene} scale={s} dispose={null} />
    </group>
  );
}

interface Props {
  path: string;
  scale?: number;
  scaleVec?: [number, number, number];
  fallback: ReactNode;
  loadingFallback?: ReactNode;
  hideMeshes?: string[];
  rotation?: [number, number, number];
}

export function ModelWithFallback({ path, scale, scaleVec, fallback, loadingFallback = null, hideMeshes, rotation }: Props) {
  return (
    <ModelErrorBoundary fallback={fallback}>
      <Suspense fallback={loadingFallback}>
        <GLBModel path={path} scale={scale} scaleVec={scaleVec} hideMeshes={hideMeshes} rotation={rotation} />
      </Suspense>
    </ModelErrorBoundary>
  );
}
