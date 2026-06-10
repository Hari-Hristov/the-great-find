import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <Topbar title="Settings" subtitle="App configuration & info" />

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
