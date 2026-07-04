import { motion, AnimatePresence } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { Spotlight } from "@/components/landing/primitives/Spotlight";

interface Props {
  visible: boolean;
}

export function DeliveryCTA({ visible }: Props) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="delivery-cta"
          className="pointer-events-auto fixed inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-[#090912]/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
        >
          <motion.p
            className="font-mono text-xs tracking-widest text-white/40 uppercase"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            now
          </motion.p>
          <motion.h2
            className="font-display text-4xl font-semibold text-white md:text-5xl"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.7 }}
          >
            Start Hunting
          </motion.h2>
          <motion.p
            className="max-w-sm text-center text-sm text-white/50"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            Runs locally. Polls every 30 min. Fires OS + email alerts when a match lands.
          </motion.p>
          <motion.div
            className="flex gap-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75, duration: 0.6 }}
          >
            <Spotlight className="rounded-full" size={200}>
              <Link
                to="/dashboard"
                onClick={() => sessionStorage.setItem("desktop-entered", "1")}
                className="relative z-20 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-opacity hover:opacity-90"
              >
                Open the dashboard →
              </Link>
            </Spotlight>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
