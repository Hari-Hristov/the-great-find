export function CrtOverlay() {
  return (
    <>
      {/* Film grain noise */}
      <svg className="pointer-events-none fixed inset-0 z-[9998] h-full w-full opacity-[0.16]" aria-hidden>
        <filter id="crt-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#crt-noise)" />
      </svg>

      {/* Scanlines */}
      <div
        className="pointer-events-none fixed inset-0 z-[9997]"
        aria-hidden
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0px, transparent 1px, var(--color-scanline) 1px, var(--color-scanline) 2px)",
          backgroundSize: "100% 2px",
        }}
      />
    </>
  );
}
