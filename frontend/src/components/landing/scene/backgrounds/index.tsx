import type { MutableRefObject } from "react";
import type { SceneState } from "../sceneState";
import { DepthsDom, DepthsScene, DepthsEffects } from "./VariantDepths";
import {
  ChromaticWireframeDom,
  ChromaticWireframeScene,
  ChromaticWireframeEffects,
} from "./VariantChromaticWireframe";
import {
  AuroraFieldDom,
  AuroraFieldScene,
  AuroraFieldEffects,
} from "./VariantAuroraField";
import {
  KineticTypeDom,
  KineticTypeScene,
  KineticTypeEffects,
} from "./VariantKineticType";

// Change ONE line to switch backgrounds. After the user picks a winner,
// the losers get deleted and this file collapses to a direct import.
export type BackgroundVariantId =
  | "depths"
  | "chromatic-wireframe"
  | "aurora-field"
  | "kinetic-type";

export const ACTIVE_VARIANT: BackgroundVariantId = "depths";
// options: "depths" | "chromatic-wireframe" | "aurora-field" | "kinetic-type"

// DOM layer (behind the canvas). Renders the base gradient/backdrop
// that shows through the transparent canvas.
export function BackgroundDom({ variant }: { variant: BackgroundVariantId }) {
  switch (variant) {
    case "depths":              return <DepthsDom />;
    case "chromatic-wireframe": return <ChromaticWireframeDom />;
    case "aurora-field":        return <AuroraFieldDom />;
    case "kinetic-type":        return <KineticTypeDom />;
  }
}

// R3F layer (inside the canvas). Renders lights, particles, fog,
// geometry — everything that lives in the 3D scene EXCEPT the consoles.
export function BackgroundScene({ variant, stateRef }: {
  variant: BackgroundVariantId;
  stateRef: MutableRefObject<SceneState>;
}) {
  switch (variant) {
    case "depths":              return <DepthsScene stateRef={stateRef} />;
    case "chromatic-wireframe": return <ChromaticWireframeScene stateRef={stateRef} />;
    case "aurora-field":        return <AuroraFieldScene stateRef={stateRef} />;
    case "kinetic-type":        return <KineticTypeScene stateRef={stateRef} />;
  }
}

// Postprocessing stack — different variants want different atmospheres.
export function BackgroundEffects({ variant }: { variant: BackgroundVariantId }) {
  switch (variant) {
    case "depths":              return <DepthsEffects />;
    case "chromatic-wireframe": return <ChromaticWireframeEffects />;
    case "aurora-field":        return <AuroraFieldEffects />;
    case "kinetic-type":        return <KineticTypeEffects />;
  }
}
