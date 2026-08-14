import { Component, Suspense } from "react";
import type { ReactNode } from "react";
import { Center, useGLTF } from "@react-three/drei";
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

function GLBModel({ path, scale = 1, scaleVec, hideMeshes, rotation, autoCenter = false }: { path: string; scale?: number; scaleVec?: [number, number, number]; hideMeshes?: string[]; rotation?: [number, number, number]; autoCenter?: boolean }) {
  const { scene } = useGLTF(path) as { scene: Group };
  if (hideMeshes?.length) {
    scene.traverse((obj) => {
      if (hideMeshes.includes(obj.name)) obj.visible = false;
    });
  }
  const s = scaleVec ?? scale;
  const inner = <primitive object={scene} scale={s} dispose={null} />;
  return (
    <group rotation={rotation as unknown as Euler}>
      {autoCenter ? <Center>{inner}</Center> : inner}
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
  autoCenter?: boolean;
}

export function ModelWithFallback({ path, scale, scaleVec, fallback, loadingFallback = null, hideMeshes, rotation, autoCenter }: Props) {
  return (
    <ModelErrorBoundary fallback={fallback}>
      <Suspense fallback={loadingFallback}>
        <GLBModel path={path} scale={scale} scaleVec={scaleVec} hideMeshes={hideMeshes} rotation={rotation} autoCenter={autoCenter} />
      </Suspense>
    </ModelErrorBoundary>
  );
}
