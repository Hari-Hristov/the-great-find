import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme, type ThemeId } from "@/contexts/ThemeContext";
import {
  useNotificationSettings,
  useSaveNotificationSettings,
  type NotificationSettings,
} from "@/api/hooks/queries";

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
  const { data: notifSettings } = useNotificationSettings();
  const saveNotif = useSaveNotificationSettings();

  const isEmailConfigured = Boolean(notifSettings?.smtp_host);

  const [form, setForm] = useState<NotificationSettings>({
    smtp_host: "",
    smtp_port: 587,
    smtp_username: "",
    smtp_password: "",
    from_addr: "",
    to_addr: "",
  });
  const [formLoaded, setFormLoaded] = useState(false);

  if (notifSettings && !formLoaded) {
    setForm({
      smtp_host: notifSettings.smtp_host ?? "",
      smtp_port: notifSettings.smtp_port ?? 587,
      smtp_username: notifSettings.smtp_username ?? "",
      smtp_password: notifSettings.smtp_password ?? "",
      from_addr: notifSettings.from_addr ?? "",
      to_addr: notifSettings.to_addr ?? "",
    });
    setFormLoaded(true);
  }

  function handleChange(key: keyof NotificationSettings, value: string | number) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

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

          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription>OS alerts are always on. Email is optional.</CardDescription>
                </div>
                {!isEmailConfigured && (
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                    Email not configured
                  </span>
                )}
                {isEmailConfigured && (
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                    Email configured
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <Row k="OS notifications" v="Enabled — fires on every alert match and poll failure" />

              <div className="border-t border-[var(--color-border-subtle)] pt-4">
                <p className="mb-4 text-xs text-[var(--color-text-muted)]">
                  Email is sent via your own SMTP credentials — nothing is stored outside this machine.
                  Gmail users: use an App Password (Google Account → Security → App Passwords).
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    label="SMTP Host"
                    placeholder="smtp.gmail.com"
                    value={form.smtp_host}
                    onChange={(v) => handleChange("smtp_host", v)}
                  />
                  <Field
                    label="SMTP Port"
                    placeholder="587"
                    value={String(form.smtp_port)}
                    onChange={(v) => handleChange("smtp_port", parseInt(v, 10) || 587)}
                  />
                  <Field
                    label="Username"
                    placeholder="you@gmail.com"
                    value={form.smtp_username}
                    onChange={(v) => handleChange("smtp_username", v)}
                  />
                  <Field
                    label="Password"
                    placeholder="App password"
                    type="password"
                    value={form.smtp_password}
                    onChange={(v) => handleChange("smtp_password", v)}
                  />
                  <Field
                    label="From address"
                    placeholder="you@gmail.com"
                    value={form.from_addr}
                    onChange={(v) => handleChange("from_addr", v)}
                  />
                  <Field
                    label="To address"
                    placeholder="you@gmail.com"
                    value={form.to_addr}
                    onChange={(v) => handleChange("to_addr", v)}
                  />
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={() => saveNotif.mutate(form)}
                    disabled={saveNotif.isPending}
                    className="rounded-[var(--radius-btn)] bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                  >
                    {saveNotif.isPending ? "Saving…" : "Save"}
                  </button>
                  {saveNotif.isSuccess && (
                    <span className="text-xs text-emerald-400">Saved</span>
                  )}
                  {saveNotif.isError && (
                    <span className="text-xs text-red-400">Failed to save</span>
                  )}
                </div>
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

function Field({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[var(--radius-input,4px)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elev)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
      />
    </label>
  );
}
