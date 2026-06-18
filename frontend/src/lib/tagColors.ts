export const TAG_COLORS = [
  { name: "red",    bg: "bg-red-500" },
  { name: "orange", bg: "bg-orange-400" },
  { name: "yellow", bg: "bg-yellow-400" },
  { name: "green",  bg: "bg-green-500" },
  { name: "blue",   bg: "bg-blue-500" },
  { name: "purple", bg: "bg-purple-500" },
  { name: "pink",   bg: "bg-pink-400" },
] as const;

export type TagColorName = (typeof TAG_COLORS)[number]["name"];

const TAG_BG: Record<TagColorName, string> = Object.fromEntries(
  TAG_COLORS.map((c) => [c.name, c.bg]),
) as Record<TagColorName, string>;

export function tagBg(color?: string): string {
  if (!color) return "bg-zinc-500";
  return TAG_BG[color as TagColorName] ?? "bg-zinc-500";
}
