import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  WINDOW_DEFS,
  windowIdForRoute,
  windowDefById,
  type WindowId,
  useDesktop,
  DESKTOP_ICON_Z,
} from "@/contexts/DesktopContext";
import { DesktopIcon } from "./DesktopIcon";
import { AppWindow } from "./AppWindow";
import { Taskbar } from "./Taskbar";
import { CrtOverlay } from "./CrtOverlay";
import { OverviewPage } from "@/pages/dashboard/OverviewPage";
import { SearchesPage } from "@/pages/dashboard/SearchesPage";
import { NewSearchPage } from "@/pages/dashboard/NewSearchPage";
import { SearchDetailPage } from "@/pages/dashboard/SearchDetailPage";
import { SearchAnalyticsPage } from "@/pages/dashboard/SearchAnalyticsPage";
import { AlertsPage } from "@/pages/dashboard/AlertsPage";
import { AlertDetailPage } from "@/pages/dashboard/AlertDetailPage";
import { FlaggedPage } from "@/pages/dashboard/FlaggedPage";
import { SettingsPage } from "@/pages/dashboard/SettingsPage";

function WindowContent({ id, route }: { id: WindowId; route: string }) {
  if (id === "searches") {
    if (/^\/dashboard\/searches\/\d+\/analytics$/.test(route)) return <SearchAnalyticsPage />;
    if (route === "/dashboard/searches/new") return <NewSearchPage />;
    if (/^\/dashboard\/searches\/\d+$/.test(route)) return <SearchDetailPage />;
    return <SearchesPage />;
  }
  if (id === "alerts") {
    if (/^\/dashboard\/alerts\/\d+$/.test(route)) return <AlertDetailPage />;
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
  const { windows, openWindow, closeWindow, focusWindow, toggleMinimize, pushRoute } = useDesktop();
  const hydratedRef = useRef(false);

  // One-time hydration from URL on first mount: if the user landed on /dashboard/searches/123
  // directly, seed the searches window's history with the matching stack.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const id = windowIdForRoute(pathname);
    if (!id) return;
    openWindow(id);
    const def = windowDefById(id);
    if (pathname !== def.route) {
      pushRoute(id, pathname);
    }
  }, [pathname, openWindow, pushRoute]);

  // Mirror the focused window's top-of-stack into the URL bar, but never the other way around.
  // This keeps the URL meaningful for refresh / sharing without driving the in-window state.
  function syncUrl(id: WindowId) {
    const win = windows.find((w) => w.id === id);
    if (!win) return;
    const top = win.history[win.history.length - 1];
    if (top !== pathname) navigate({ to: top as never });
  }

  // Reactively sync URL whenever the focused window's history top changes (e.g. push/pop inside a window).
  const focusedTop = (() => {
    const focused = [...windows]
      .filter((w) => w.open && !w.minimized)
      .sort((a, b) => b.zIndex - a.zIndex)[0];
    return focused ? focused.history[focused.history.length - 1] : null;
  })();
  useEffect(() => {
    if (focusedTop && focusedTop !== pathname) navigate({ to: focusedTop as never });
  }, [focusedTop]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleIconClick(id: WindowId) {
    const win = windows.find((w) => w.id === id)!;
    if (win.open) {
      focusWindow(id);
      if (win.minimized) syncUrl(id);
      return;
    }
    openWindow(id);
    syncUrl(id);
  }

  function handleTaskbarClick(id: WindowId) {
    const win = windows.find((w) => w.id === id)!;
    if (win.open && !win.minimized) {
      toggleMinimize(id);
    } else {
      focusWindow(id);
      syncUrl(id);
    }
  }

  function navigateAfterClose(id: WindowId) {
    if (windowIdForRoute(pathname) !== id) return;
    const fallback = [...windows]
      .filter((w) => w.open && w.id !== id)
      .sort((a, b) => b.zIndex - a.zIndex)[0];
    if (fallback) {
      const top = fallback.history[fallback.history.length - 1];
      navigate({ to: top as never });
    } else {
      navigate({ to: "/dashboard" as never });
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
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% 50%, rgba(30,55,140,0.22) 0%, transparent 70%)",
        }}
      />

      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="absolute right-5 top-5 grid grid-cols-2 gap-2 pb-14" style={{ zIndex: DESKTOP_ICON_Z }}>
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

      {WINDOW_DEFS.map((def) => {
        const win = windows.find((w) => w.id === def.id)!;
        if (!win.open) return null;
        const top = win.history[win.history.length - 1];
        return (
          <AppWindow
            key={def.id}
            id={def.id}
            onClose={() => handleTitlebarClose(def.id)}
            onFocus={() => syncUrl(def.id)}
          >
            <WindowContent id={def.id} route={top} />
          </AppWindow>
        );
      })}

      <Taskbar onChipClick={handleTaskbarClick} onChipClose={handleTaskbarClose} />
      <CrtOverlay />
    </div>
  );
}

export function Desktop({ entered = false }: { entered?: boolean }) {
  return <DesktopInner entered={entered} />;
}
