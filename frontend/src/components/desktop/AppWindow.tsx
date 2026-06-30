import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDesktop, useWindow, windowDefById, type WindowId, FULLSCREEN_Z } from "@/contexts/DesktopContext";

interface TitlebarButtonProps {
  color: string;
  label: string;
  hoverSymbol: string;
  onClick: (e: React.MouseEvent) => void;
}

function TitlebarButton({ color, label, hoverSymbol, onClick }: TitlebarButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="group relative flex h-3 w-3 items-center justify-center rounded-full transition-opacity hover:opacity-90"
      style={{ background: color }}
    >
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[7px] font-bold opacity-0 group-hover:opacity-100" style={{ color: "rgba(0,0,0,0.6)" }}>
        {hoverSymbol}
      </span>
    </button>
  );
}

interface AppWindowProps {
  id: WindowId;
  onClose: () => void;
  onFocus: () => void;
  children: React.ReactNode;
}

export function AppWindow({ id, onClose, onFocus, children }: AppWindowProps) {
  const { focusWindow, moveWindow, toggleMinimize, toggleFullscreen } = useDesktop();
  const win = useWindow(id);
  const def = windowDefById(id);

  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, wx: 0, wy: 0 });
  const frameId = useRef<number | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);

  const onTitlebarPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      if (win.fullscreen) return;
      e.preventDefault();
      focusWindow(id);
      dragging.current = true;
      dragStart.current = {
        mx: e.clientX,
        my: e.clientY,
        wx: win.position.x,
        wy: win.position.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [id, focusWindow, win.position, win.fullscreen],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      const newX = dragStart.current.wx + dx;
      const newY = dragStart.current.wy + dy;

      if (frameId.current !== null) cancelAnimationFrame(frameId.current);
      frameId.current = requestAnimationFrame(() => {
        moveWindow(id, { x: newX, y: newY });
      });
    },
    [id, moveWindow],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  useEffect(() => {
    return () => {
      if (frameId.current !== null) cancelAnimationFrame(frameId.current);
    };
  }, []);

  const fsStyle = win.fullscreen
    ? { position: "fixed" as const, left: 0, top: 0, width: "100vw", height: "100vh", zIndex: FULLSCREEN_Z }
    : {
        position: "absolute" as const,
        left: win.position.x,
        top: win.position.y,
        width: win.size.w,
        height: win.size.h,
        zIndex: win.zIndex,
      };

  return (
    <AnimatePresence>
      {win.open && (
        <motion.div
          ref={windowRef}
          key={id}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={
            win.minimized
              ? { opacity: 0, scale: 0.88, y: 40 }
              : { opacity: 1, scale: 1, y: 0 }
          }
          exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.12 } }}
          transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
          onPointerDown={() => { focusWindow(id); onFocus(); }}
          style={{
            ...fsStyle,
            pointerEvents: win.minimized ? "none" : "auto",
            borderColor: "var(--color-win-border)",
            boxShadow: "0 8px 48px var(--color-win-glow), 0 2px 8px rgba(0,0,0,0.5)",
          }}
          className="flex flex-col overflow-hidden rounded-sm border"
          aria-label={`${def.title} window`}
          role="dialog"
          aria-modal="false"
        >
          {/* Titlebar */}
          <div
            className="flex h-8 shrink-0 cursor-default select-none items-center gap-2 border-b px-3"
            style={{
              background: "var(--color-win-titlebar)",
              borderColor: "var(--color-win-border)",
              cursor: win.fullscreen ? "default" : undefined,
            }}
            onPointerDown={onTitlebarPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div className="flex items-center gap-1.5">
              <TitlebarButton color="#ff5f57" label="Close" hoverSymbol="×" onClick={(e) => { e.stopPropagation(); onClose(); }} />
              <TitlebarButton color="#febc2e" label="Minimize" hoverSymbol="−" onClick={(e) => { e.stopPropagation(); toggleMinimize(id); }} />
              <TitlebarButton
                color="#28c840"
                label={win.fullscreen ? "Exit fullscreen" : "Fullscreen"}
                hoverSymbol={win.fullscreen ? "⤡" : "+"}
                onClick={(e) => { e.stopPropagation(); toggleFullscreen(id); }}
              />
            </div>

            <span
              className="flex-1 text-center font-mono text-[11px] uppercase tracking-[0.12em]"
              style={{ color: "var(--color-win-titlebar-text)" }}
            >
              {def.title}
            </span>

            <div className="w-[38px]" />
          </div>

          {/* Content */}
          <div
            className="flex-1 overflow-auto"
            style={{ background: "var(--color-bg-base)" }}
          >
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
