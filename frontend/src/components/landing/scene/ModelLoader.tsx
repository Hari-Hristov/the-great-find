import { Component, Suspense } from "react";
import type { ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import type { Group } from "three";

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

function GLBModel({ path, scale = 1 }: { path: string; scale?: number }) {
  const { scene } = useGLTF(path) as { scene: Group };
  return <primitive object={scene} scale={scale} dispose={null} />;
}

interface Props {
  path: string;
  scale?: number;
  fallback: ReactNode;
}

export function ModelWithFallback({ path, scale, fallback }: Props) {
  return (
    <ModelErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GLBModel path={path} scale={scale} />
      </Suspense>
    </ModelErrorBoundary>
  );
}
