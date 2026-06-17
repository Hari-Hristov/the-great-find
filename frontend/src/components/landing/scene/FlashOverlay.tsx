import { motion, AnimatePresence } from "framer-motion";

interface Props {
  glitchActive: boolean;
}

export function FlashOverlay({ glitchActive }: Props) {
  return (
    <>
      {/* Persistent vignette */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.45) 100%)",
        }}
      />

      {/* Glitch sweep — pivot transition */}
      <AnimatePresence>
        {glitchActive && (
          <motion.div
            key="glitch"
            className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "linear" }}
          >
            <motion.div
              className="absolute inset-0"
              style={{ background: "rgba(80,0,180,0.12)" }}
              animate={{ x: [0, 6, -4, 0] }}
              transition={{ duration: 0.25, ease: "linear" }}
            />
            <motion.div
              className="absolute inset-0"
              style={{ background: "rgba(0,180,180,0.08)" }}
              animate={{ x: [0, -8, 3, 0] }}
              transition={{ duration: 0.25, ease: "linear" }}
            />
            {([20, 42, 67, 88] as const).map((top, i) => (
              <div
                key={top}
                className="absolute left-0 right-0 h-px"
                style={{
                  top: `${top}%`,
                  background: "rgba(180,180,255,0.2)",
                  transform: `translateX(${i % 2 === 0 ? 4 : -4}px)`,
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

