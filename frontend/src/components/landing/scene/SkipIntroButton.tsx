import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  onSkip: () => void;
}

export function SkipIntroButton({ onSkip }: Props) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setVisible(true), 3000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key="skip"
          onClick={onSkip}
          className="fixed right-8 bottom-8 z-40 rounded-full border border-white/20 bg-black/40 px-4 py-2 text-xs text-white/60 backdrop-blur transition-colors hover:border-white/40 hover:text-white/90"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.4 }}
        >
          skip intro →
        </motion.button>
      )}
    </AnimatePresence>
  );
}
