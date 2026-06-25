import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { OverviewPage } from "@/routes/dashboard/index";
import { SearchesPage } from "@/routes/dashboard/searches.index";
import { AlertsPage } from "@/routes/dashboard/alerts.index";
import { FlaggedPage } from "@/routes/dashboard/flagged";
import { SettingsPage } from "@/routes/dashboard/settings";

export type WindowId = "overview" | "searches" | "alerts" | "flagged" | "settings";

export interface WindowDef {
  id: WindowId;
  title: string;
  route: string;
  iconSlot: "overview" | "searches" | "alerts" | "flagged" | "settings";
  component: React.ComponentType;
}

export const WINDOW_DEFS: WindowDef[] = [
  { id: "overview", title: "OVERVIEW", route: "/dashboard", iconSlot: "overview", component: OverviewPage },
  { id: "searches", title: "SEARCHES", route: "/dashboard/searches", iconSlot: "searches", component: SearchesPage },
  { id: "alerts", title: "ALERTS", route: "/dashboard/alerts", iconSlot: "alerts", component: AlertsPage },
  { id: "flagged", title: "FLAGGED", route: "/dashboard/flagged", iconSlot: "flagged", component: FlaggedPage },
  { id: "settings", title: "SETTINGS", route: "/dashboard/settings", iconSlot: "settings", component: SettingsPage },
];

export interface WindowState {
  id: WindowId;
  position: { x: number; y: number };
  size: { w: number; h: number };
  zIndex: number;
  minimized: boolean;
  open: boolean;
  lastPosition: { x: number; y: number } | null;
  lastSize: { w: number; h: number } | null;
  resetOnNextOpen: boolean;
}

function defaultSize() {
  if (typeof window === "undefined") return { w: 900, h: 640 };
  return {
    w: Math.min(Math.round(window.innerWidth * 0.78), 960),
    h: Math.min(Math.round(window.innerHeight * 0.76), 700),
  };
}

function defaultPosition() {
  if (typeof window === "undefined") return { x: 200, y: 60 };
  const size = defaultSize();
  const x = Math.round((window.innerWidth - size.w) / 2) - 60;
  const y = Math.round((window.innerHeight - size.h) / 2);
  return { x: Math.max(10, x), y: Math.max(10, y) };
}

function buildInitial(): WindowState[] {
  return WINDOW_DEFS.map((def) => ({
    id: def.id,
    position: { x: 0, y: 0 },
    size: { w: 0, h: 0 },
    zIndex: 10,
    minimized: false,
    open: false,
    lastPosition: null,
    lastSize: null,
    resetOnNextOpen: false,
  }));
}

interface DesktopContextValue {
  windows: WindowState[];
  openWindow: (id: WindowId) => void;
  closeWindow: (id: WindowId, resetPosition?: boolean) => void;
  focusWindow: (id: WindowId) => void;
  moveWindow: (id: WindowId, pos: { x: number; y: number }) => void;
  toggleMinimize: (id: WindowId) => void;
  maxZ: () => number;
}

const DesktopContext = createContext<DesktopContextValue | null>(null);

export function DesktopProvider({ children }: { children: React.ReactNode }) {
  const [windows, setWindows] = useState<WindowState[]>(buildInitial);
  const zCounter = useRef(100);

  const maxZ = useCallback(() => zCounter.current, []);

  const openWindow = useCallback((id: WindowId) => {
    setWindows((prev) => {
      const target = prev.find((w) => w.id === id);
      if (target?.open) {
        const maxCurrent = Math.max(...prev.filter((w) => w.open).map((w) => w.zIndex));
        return prev.map((w) =>
          w.id === id ? { ...w, minimized: false, zIndex: maxCurrent + 1 } : w,
        );
      }
      const useDefault = !target || target.resetOnNextOpen || !target.lastPosition;
      const size = useDefault ? defaultSize() : target.lastSize!;
      const pos = useDefault ? defaultPosition() : target.lastPosition!;
      const openCount = prev.filter((w) => w.open).length;
      const z = openCount + 1;
      zCounter.current = z;
      return prev.map((w) =>
        w.id === id
          ? { ...w, open: true, minimized: false, zIndex: z, size, position: pos, resetOnNextOpen: false }
          : w,
      );
    });
  }, []);

  const closeWindow = useCallback((id: WindowId, resetPosition = false) => {
    setWindows((prev) => {
      const target = prev.find((w) => w.id === id);
      const closed = prev.map((w) =>
        w.id === id
          ? {
              ...w,
              open: false,
              zIndex: 10,
              lastPosition: target ? target.position : w.lastPosition,
              lastSize: target ? target.size : w.lastSize,
              resetOnNextOpen: resetPosition,
            }
          : w,
      );
      const openSorted = closed
        .filter((w) => w.open)
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((w, i) => ({ ...w, zIndex: i + 1 }));
      zCounter.current = openSorted.length;
      const openIds = new Set(openSorted.map((w) => w.id));
      return closed.map((w) => {
        const ranked = openSorted.find((o) => o.id === w.id);
        return ranked ?? (openIds.has(w.id) ? w : { ...w, zIndex: 10 });
      });
    });
  }, []);

  const focusWindow = useCallback((id: WindowId) => {
    setWindows((prev) => {
      const currentMax = Math.max(...prev.filter((w) => w.open).map((w) => w.zIndex));
      const newZ = currentMax + 1;
      zCounter.current = newZ;
      return prev.map((w) =>
        w.id === id ? { ...w, zIndex: newZ, minimized: false } : w,
      );
    });
  }, []);

  const moveWindow = useCallback((id: WindowId, pos: { x: number; y: number }) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, position: pos } : w)));
  }, []);

  const toggleMinimize = useCallback((id: WindowId) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, minimized: !w.minimized } : w)),
    );
  }, []);

  const value = useMemo(
    () => ({ windows, openWindow, closeWindow, focusWindow, moveWindow, toggleMinimize, maxZ }),
    [windows, openWindow, closeWindow, focusWindow, moveWindow, toggleMinimize, maxZ],
  );

  return <DesktopContext.Provider value={value}>{children}</DesktopContext.Provider>;
}

export function useDesktop() {
  const ctx = useContext(DesktopContext);
  if (!ctx) throw new Error("useDesktop must be used inside DesktopProvider");
  return ctx;
}

export function useWindow(id: WindowId) {
  const { windows } = useDesktop();
  return windows.find((w) => w.id === id)!;
}

export function windowDefById(id: WindowId): WindowDef {
  return WINDOW_DEFS.find((d) => d.id === id)!;
}

export function windowIdForRoute(pathname: string): WindowId | null {
  if (pathname === "/dashboard" || pathname === "/dashboard/") return "overview";
  if (pathname.startsWith("/dashboard/searches")) return "searches";
  if (pathname.startsWith("/dashboard/alerts")) return "alerts";
  if (pathname.startsWith("/dashboard/flagged")) return "flagged";
  if (pathname.startsWith("/dashboard/settings")) return "settings";
  return null;
}
