import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  DesktopProvider,
  WINDOW_DEFS,
  windowIdForRoute,
  windowDefById,
  type WindowId,
  useDesktop,
} from "@/contexts/DesktopContext";
import { DesktopIcon } from "./DesktopIcon";
import { AppWindow } from "./AppWindow";
import { Taskbar } from "./Taskbar";
import { CrtOverlay } from "./CrtOverlay";
import { OverviewPage } from "@/routes/dashboard/index";
import { SearchesPage } from "@/routes/dashboard/searches.index";
import { NewSearchPage } from "@/routes/dashboard/searches.new";
import { SearchDetailPage } from "@/routes/dashboard/searches.$id";
import { SearchAnalyticsPage } from "@/routes/dashboard/searches.$id.analytics";
import { AlertsPage } from "@/routes/dashboard/alerts.index";
import { AlertDetailPage } from "@/routes/dashboard/alerts.$searchId";
import { FlaggedPage } from "@/routes/dashboard/flagged";
import { SettingsPage } from "@/routes/dashboard/settings";

function WindowContent({ id, windowRoute, globalPathname }: { id: WindowId; windowRoute: string; globalPathname: string }) {
  if (id === "searches") {
    const active = globalPathname.startsWith("/dashboard/searches/") ? globalPathname : windowRoute;
    const isGloballyActive = globalPathname.startsWith("/dashboard/searches/");
    if (isGloballyActive) {
      if (active.endsWith("/analytics") || active.includes("/analytics")) return <SearchAnalyticsPage />;
      if (active === "/dashboard/searches/new") return <NewSearchPage />;
      return <SearchDetailPage />;
    }
    if (windowRoute.startsWith("/dashboard/searches/")) return <SearchesPage />;
    return <SearchesPage />;
  }
  if (id === "alerts") {
    if (globalPathname.startsWith("/dashboard/alerts/")) return <AlertDetailPage />;
    return <AlertsPage />;
  }
  if (id === "overview") return <OverviewPage />;
  if (id === "flagged") return <FlaggedPage />;
  if (id === "settings") return <SettingsPage />;
  return null;
}

function DesktopInner({ entered }: { entered: boolean }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { windows, openWindow, closeWindow, focusWindow, toggleMinimize, setActiveRoute } = useDesktop();

  useEffect(() => {
    const id = windowIdForRoute(pathname);
    if (id) openWindow(id);
    // Only run on mount to restore from direct URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = windowIdForRoute(pathname);
    if (id) setActiveRoute(id, pathname);
  }, [pathname, setActiveRoute]);

  function navigateToWindow(id: WindowId) {
    const def = windowDefById(id);
    navigate({ to: def.route as never });
  }

  function navigateToActiveRoute(id: WindowId) {
    const win = windows.find((w) => w.id === id)!;
    navigate({ to: win.activeRoute as never });
  }

  function navigateAfterClose(id: WindowId) {
    if (windowIdForRoute(pathname) !== id) return;
    const fallback = [...windows]
      .filter((w) => w.open && w.id !== id)
      .sort((a, b) => b.zIndex - a.zIndex)[0];
    navigate({ to: fallback ? (windowDefById(fallback.id).route as never) : ("/dashboard" as never) });
  }

  function handleIconClick(id: WindowId) {
    const win = windows.find((w) => w.id === id)!;
    if (win.open) {
      focusWindow(id);
      if (win.minimized) navigateToActiveRoute(id);
      return;
    }
    openWindow(id);
    navigateToWindow(id);
  }

  function handleTaskbarClick(id: WindowId) {
    const win = windows.find((w) => w.id === id)!;
    if (win.open && !win.minimized) {
      toggleMinimize(id);
    } else {
      focusWindow(id);
      navigateToActiveRoute(id);
    }
  }

  function handleTitlebarClose(id: WindowId) {
    closeWindow(id);
    navigateAfterClose(id);
  }

  function handleTaskbarClose(id: WindowId) {
    closeWindow(id, true);
    navigateAfterClose(id);
  }

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: "var(--color-desktop-bg)" }}
    >
      {/* Wallpaper radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% 50%, rgba(30,55,140,0.22) 0%, transparent 70%)",
        }}
      />

      {/* Dot grid */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Desktop icons — top-right, 2-column grid, above windows */}
      <div className="absolute right-5 top-5 z-[300] grid grid-cols-2 gap-2 pb-14">
        {WINDOW_DEFS.map((def, i) => {
          const win = windows.find((w) => w.id === def.id)!;
          return (
            <motion.div
              key={def.id}
              initial={{ opacity: 0, y: entered ? -8 : 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: entered ? i * 0.07 + 0.1 : i * 0.06 + 0.15,
                duration: entered ? 0.32 : 0.22,
                ease: "easeOut",
              }}
            >
              <DesktopIcon
                id={def.id}
                label={def.title}
                isOpen={win.open}
                isMinimized={win.minimized}
                onClick={() => handleIconClick(def.id)}
              />
            </motion.div>
          );
        })}
      </div>

      {/* Floating windows */}
      {WINDOW_DEFS.map((def) => {
        const win = windows.find((w) => w.id === def.id)!;
        if (!win.open) return null;
        return (
          <AppWindow
            key={def.id}
            id={def.id}
            onClose={() => handleTitlebarClose(def.id)}
            onFocus={() => { if (windowIdForRoute(pathname) !== def.id) navigateToActiveRoute(def.id); }}
          >
            <WindowContent id={def.id} windowRoute={win.activeRoute} globalPathname={pathname} />
          </AppWindow>
        );
      })}

      <Taskbar onChipClick={handleTaskbarClick} onChipClose={handleTaskbarClose} />
      <CrtOverlay />
    </div>
  );
}

export function Desktop({ entered = false }: { entered?: boolean }) {
  return (
    <DesktopProvider>
      <DesktopInner entered={entered} />
    </DesktopProvider>
  );
}
