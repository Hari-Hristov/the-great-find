import type { MutableRefObject } from "react";
import type { SceneState } from "../sceneState";
import { DepthsDom, DepthsScene, DepthsEffects } from "./VariantDepths";
import { CathedralDom, CathedralScene, CathedralEffects } from "./VariantCathedral";
import { NebulaDom, NebulaScene, NebulaEffects } from "./VariantNebula";

// Change ONE line to switch backgrounds. After the user picks a winner,
// the other two variant files get deleted and this file collapses to a
// direct import of the winner.
export type BackgroundVariantId = "depths" | "cathedral" | "nebula";

export const ACTIVE_VARIANT: BackgroundVariantId = "depths";

// DOM layer (behind the canvas). Renders the base gradient/backdrop
// that shows through the transparent canvas.
export function BackgroundDom({ variant }: { variant: BackgroundVariantId }) {
  switch (variant) {
    case "depths":    return <DepthsDom />;
    case "cathedral": return <CathedralDom />;
    case "nebula":    return <NebulaDom />;
  }
}

// R3F layer (inside the canvas). Renders lights, particles, fog,
// geometry — everything that lives in the 3D scene EXCEPT the consoles.
export function BackgroundScene({ variant, stateRef }: {
  variant: BackgroundVariantId;
  stateRef: MutableRefObject<SceneState>;
}) {
  switch (variant) {
    case "depths":    return <DepthsScene stateRef={stateRef} />;
    case "cathedral": return <CathedralScene stateRef={stateRef} />;
    case "nebula":    return <NebulaScene stateRef={stateRef} />;
  }
}

// Postprocessing stack — different variants want different atmospheres.
export function BackgroundEffects({ variant }: { variant: BackgroundVariantId }) {
  switch (variant) {
    case "depths":    return <DepthsEffects />;
    case "cathedral": return <CathedralEffects />;
    case "nebula":    return <NebulaEffects />;
  }
}
