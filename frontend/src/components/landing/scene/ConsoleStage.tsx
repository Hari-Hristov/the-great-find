import { useState, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import type { SceneState } from "./sceneState";
import { Console3DS, ConsoleSwitch, ConsoleSteamDeck } from "./Consoles";

// ConsoleStage — console-switching pipeline ONLY.
// Background lighting and atmosphere live in the active
// background variant (see ./backgrounds/index.tsx). This component
// is intentionally minimal: it reads the current section from stateRef
// every frame and shows the matching console, nothing else.
function ActiveConsoles({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  const [section, setSection] = useState<SceneState["section"]>("cold-open");
  const sectionRef = useRef<SceneState["section"]>("cold-open");
  useFrame(() => {
    const next = stateRef.current.section;
    if (next !== sectionRef.current) {
      sectionRef.current = next;
      setSection(next);
    }
  });

  const show3ds = section === "3ds-hero" || section === "portal-dive";
  const showSwitch = section === "switch-emergence" || section === "pivot" || section === "screen-dive";
  const showDeck = section === "steam-deck" || section === "delivery";

  return (
    <>
      <Console3DS visible={show3ds} />
      <ConsoleSwitch visible={showSwitch} />
      <ConsoleSteamDeck visible={showDeck} />
    </>
  );
}

export function ConsoleStage({ stateRef }: { stateRef: MutableRefObject<SceneState> }) {
  return <ActiveConsoles stateRef={stateRef} />;
}
