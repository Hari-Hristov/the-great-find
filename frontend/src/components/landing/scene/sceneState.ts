import { useRef } from "react";
import type { MutableRefObject } from "react";
import type { Section } from "./types";

export interface SceneState {
  section: Section;
  sectionProgress: number;
}

function createSceneState(): SceneState {
  return {
    section: "cold-open",
    sectionProgress: 0,
  };
}

export function useSceneStateRef(): MutableRefObject<SceneState> {
  return useRef<SceneState>(createSceneState()) as MutableRefObject<SceneState>;
}
