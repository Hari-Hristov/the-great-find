import { useRef, useState } from "react";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { cn } from "@/lib/utils";

interface SpotlightProps {
  className?: string;
  size?: number;
  children: React.ReactNode;
}

export function Spotlight({ className, size = 350, children }: SpotlightProps) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [hovered, setHovered] = useState(false);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set(e.clientX - rect.left);
    y.set(e.clientY - rect.top);
  };

  const mask = useMotionTemplate`radial-gradient(${size}px circle at ${x}px ${y}px, white, transparent 70%)`;

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn("group relative overflow-hidden", className)}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300"
        style={{
          opacity: hovered ? 1 : 0,
          background:
            "radial-gradient(circle, oklch(0.74 0.18 220 / 0.22), transparent 60%)",
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      />
      {children}
    </div>
  );
}
