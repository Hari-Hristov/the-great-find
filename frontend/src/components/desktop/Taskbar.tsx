import { useEffect, useState } from "react";
import { useDesktop, WINDOW_DEFS, type WindowId } from "@/contexts/DesktopContext";
import { useVersion } from "@/api/hooks/queries";

function Clock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--color-win-titlebar-text)" }}>
      {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}

function VersionStamp() {
  const { data } = useVersion();
  // "dev" is the default ldflags placeholder — hide it so the dashboard
  // doesn't shout "this is unreleased" at the user every session.
  if (!data?.version || data.version === "dev") return null;
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-wider opacity-60"
      style={{ color: "var(--color-win-titlebar-text)" }}
      title={data.commit ? `commit ${data.commit}${data.date ? ` · ${data.date}` : ""}` : undefined}
    >
      v{data.version}
    </span>
  );
}

interface TaskbarProps {
  onChipClick: (id: WindowId) => void;
  onChipClose: (id: WindowId) => void;
}

export function Taskbar({ onChipClick, onChipClose }: TaskbarProps) {
  const { windows } = useDesktop();
  const open = windows.filter((w) => w.open);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[200] flex h-10 items-center gap-1 border-t px-3"
      style={{
        background: "var(--color-taskbar-bg)",
        borderColor: "var(--color-taskbar-border)",
      }}
    >
      {/* App logo mark */}
      <div
        className="mr-2 flex h-6 w-6 items-center justify-center rounded font-mono text-xs font-bold"
        style={{ background: "var(--color-accent)", color: "var(--color-desktop-bg)" }}
      >
        +
      </div>

      {/* Open window chips */}
      <div className="flex flex-1 items-center gap-1">
        {WINDOW_DEFS.filter((def) => open.some((w) => w.id === def.id)).map((def) => {
          const w = open.find((x) => x.id === def.id)!;
          return (
            <div
              key={def.id}
              className="flex h-7 items-center rounded border"
              style={{ borderColor: "var(--color-win-border)" }}
            >
              <button
                onClick={() => onChipClick(def.id)}
                className="flex h-full items-center gap-1.5 pl-2.5 pr-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors"
                style={{
                  background: w.minimized ? "transparent" : "var(--color-icon-hover)",
                  color: "var(--color-win-titlebar-text)",
                  borderRadius: "inherit",
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: w.minimized ? "var(--color-text-muted)" : "var(--color-accent)" }}
                />
                {def.title}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onChipClose(def.id); }}
                aria-label={`Close ${def.title}`}
                className="flex h-full w-5 items-center justify-center font-mono text-[10px] transition-colors hover:text-red-400"
                style={{
                  background: w.minimized ? "transparent" : "var(--color-icon-hover)",
                  color: "var(--color-text-muted)",
                  borderLeft: "1px solid var(--color-win-border)",
                  borderRadius: "0 calc(var(--radius) - 1px) calc(var(--radius) - 1px) 0",
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* Clock */}
      <div className="flex items-center gap-3">
        <VersionStamp />
        <Clock />
      </div>
    </div>
  );
}
