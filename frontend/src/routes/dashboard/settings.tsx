import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme, type ThemeId } from "@/contexts/ThemeContext";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

const THEMES: { id: ThemeId; label: string; description: string; swatches: string[] }[] = [
  {
    id: "default",
    label: "Default",
    description: "Clean dark UI with blue accents",
    swatches: ["oklch(0.18 0.012 264)", "oklch(0.74 0.18 220)", "oklch(0.98 0.005 264)"],
  },
  {
    id: "military",
    label: "Military",
    description: "Phosphor-green terminal. Full mono. Sharp corners.",
    swatches: ["oklch(0.08 0.025 140)", "oklch(0.72 0.22 140)", "oklch(0.88 0.12 140)"],
  },
];

function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <>
      <Topbar title="Settings" subtitle="App configuration & info" />

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Choose a visual theme</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {THEMES.map((t) => {
                  const active = theme === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={`flex flex-1 flex-col gap-3 rounded-[var(--radius-card)] border p-4 text-left transition-colors ${
                        active
                          ? "border-[var(--color-accent)] bg-[var(--color-bg-elev)]"
                          : "border-[var(--color-border-subtle)] hover:border-[var(--color-accent)]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {t.swatches.map((color, i) => (
                          <span
                            key={i}
                            className="h-4 w-4 rounded-full border border-white/10"
                            style={{ background: color }}
                          />
                        ))}
                        {active && (
                          <span className="ml-auto text-[10px] uppercase tracking-widest text-[var(--color-accent)]">
                            active
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[var(--color-text-primary)]">{t.label}</div>
                        <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">{t.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
              <CardDescription>What this app is</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[var(--color-text-muted)]">
              <p>
                <strong className="text-[var(--color-text-primary)]">the great find</strong> is a
                local-only price monitor for olx.bg listings. The Go backend runs on{" "}
                <code className="font-mono">127.0.0.1</code> only, the SQLite DB lives next to the
                binary, and nothing leaves your machine.
              </p>
              <p>
                Currency is normalised to EUR using the fixed peg{" "}
                <code className="font-mono">1 EUR = 1.95583 BGN</code>.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Storage</CardTitle>
              <CardDescription>Where the data lives</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[var(--color-text-muted)]">
              <Row k="DB driver" v="modernc.org/sqlite (CGO-free)" />
              <Row k="Mode" v="single-user, single-binary" />
              <Row k="Bind" v="127.0.0.1 only" />
              <Row k="Auth" v="OS user account is the boundary" />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Roadmap</CardTitle>
              <CardDescription>What's coming next</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[var(--color-text-muted)]">
              <Row k="Phase 6.5" v="Landing v0 (2D scroll story)" />
              <Row k="Phase 6.6" v="Landing v1 (3D upgrade)" />
              <Row k="Phase 7" v="Tray + first-run wizard" />
              <Row k="Phase 8" v="Param discovery from olx.bg" />
              <Row k="Phase 9" v="Cross-build + release workflow" />
              <Row k="Phase 10" v="Polish + README" />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--color-border-subtle)] py-2 last:border-b-0">
      <span>{k}</span>
      <span className="font-mono text-xs text-[var(--color-text-primary)]">{v}</span>
    </div>
  );
}
