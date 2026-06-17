export type Section =
  | "cold-open"
  | "3ds-hero"
  | "portal-dive"
  | "switch-emergence"
  | "pivot"
  | "steam-deck"
  | "delivery";

export interface ScrollState {
  progress: number; // 0–1 across the full landing scroll height
  section: Section;
  sectionProgress: number; // 0–1 within the current section
}
