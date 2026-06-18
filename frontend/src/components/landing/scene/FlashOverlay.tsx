export function FlashOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-10"
      style={{
        background:
          "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.45) 100%)",
      }}
    />
  );
}

