import type { WindowId } from "@/contexts/DesktopContext";

const ICON_PIXEL_SIZE = 4;

function PixelGrid({ pixels }: { pixels: readonly string[] }) {
  const cols = 10;
  return (
    <svg
      width={cols * ICON_PIXEL_SIZE}
      height={cols * ICON_PIXEL_SIZE}
      viewBox={`0 0 ${cols * ICON_PIXEL_SIZE} ${cols * ICON_PIXEL_SIZE}`}
      aria-hidden
    >
      {pixels.map((row, r) =>
        row.split("").map((cell, c) =>
          cell !== " " ? (
            <rect
              key={`${r}-${c}`}
              x={c * ICON_PIXEL_SIZE}
              y={r * ICON_PIXEL_SIZE}
              width={ICON_PIXEL_SIZE}
              height={ICON_PIXEL_SIZE}
              fill={cell === "█" ? "var(--color-win-titlebar-text)" : "var(--color-accent)"}
            />
          ) : null,
        ),
      )}
    </svg>
  );
}

// 10×10 pixel art glyphs — █ = light, ▓ = accent
const ICONS: Record<WindowId, readonly string[]> = {
  overview: [
    " ▓▓▓▓▓▓▓▓ ",
    " ▓      ▓ ",
    " ▓  ██  ▓ ",
    " ▓  ██  ▓ ",
    " ▓▓▓▓▓▓▓▓ ",
    " ▓      ▓ ",
    " ▓ ████ ▓ ",
    " ▓ ████ ▓ ",
    " ▓▓▓▓▓▓▓▓ ",
    "          ",
  ],
  searches: [
    "   ████   ",
    "  █    █  ",
    " █      █ ",
    " █      █ ",
    "  █    █  ",
    "   ████▓  ",
    "     ▓▓   ",
    "      ▓▓  ",
    "       ▓▓ ",
    "        ▓ ",
  ],
  alerts: [
    "    ██    ",
    "   ████   ",
    "  ██  ██  ",
    " ██    ██ ",
    " ██    ██ ",
    " ██████████",
    "  ████████",
    "          ",
    "   ████   ",
    "   ████   ",
  ],
  flagged: [
    " █        ",
    " █ ▓▓▓▓▓  ",
    " █ ▓   ▓  ",
    " █ ▓▓▓▓▓  ",
    " █        ",
    " █        ",
    " █        ",
    " █        ",
    " █        ",
    "          ",
  ],
  settings: [
    "    ██    ",
    "  ██████  ",
    " █ ████ █ ",
    "██  ██  ██",
    "██  ██  ██",
    " █ ████ █ ",
    "  ██████  ",
    "    ██    ",
    "          ",
    "          ",
  ],
};

interface DesktopIconProps {
  id: WindowId;
  label: string;
  isOpen: boolean;
  isMinimized: boolean;
  onClick: () => void;
}

export function DesktopIcon({ id, label, isOpen, isMinimized, onClick }: DesktopIconProps) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-1.5 rounded p-1 outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)]"
      aria-label={`Open ${label}`}
      title={label}
    >
      <div
        className="relative flex h-16 w-16 items-center justify-center rounded border border-[var(--color-win-border)] transition-all duration-100"
        style={{
          background: isOpen
            ? "var(--color-icon-hover)"
            : "var(--color-icon-bg)",
          boxShadow: isOpen
            ? "0 0 12px var(--color-win-glow), inset 0 0 1px var(--color-win-border)"
            : "inset 0 0 1px var(--color-win-border)",
        }}
      >
        <span className="transition-transform duration-75 group-active:scale-90">
          <PixelGrid pixels={ICONS[id]} />
        </span>

        {/* Active indicator dot */}
        {isOpen && !isMinimized && (
          <span
            className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
            style={{ background: "var(--color-accent)" }}
          />
        )}
      </div>

      <span
        className="max-w-[72px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] uppercase tracking-widest"
        style={{ color: "var(--color-win-titlebar-text)" }}
      >
        {label}
      </span>
    </button>
  );
}
