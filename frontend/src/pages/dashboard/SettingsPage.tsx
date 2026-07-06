import { useEffect, useMemo, useState } from "react";
import { Check, Folder, AlertCircle } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTheme, type ThemeId } from "@/contexts/ThemeContext";
import {
  useNotificationSettings,
  useSaveNotificationSettings,
  type NotificationSettings,
} from "@/api/hooks/queries";

const THEMES: { id: ThemeId; label: string; description: string; swatches: string[] }[] = [
  {
    id: "default",
    label: "Default",
    description: "Clean dark UI with blue accents",
    swatches: ["oklch(0.18 0.012 264)", "oklch(0.25 0.012 264)", "oklch(0.74 0.18 220)", "oklch(0.98 0.005 264)"],
  },
  {
    id: "military",
    label: "Military",
    description: "Phosphor-green terminal. Full mono. Sharp corners.",
    swatches: ["oklch(0.06 0.015 140)", "oklch(0.11 0.016 140)", "oklch(0.70 0.20 140)", "oklch(0.72 0.05 140)"],
  },
];

const PLATFORM_DEFAULTS: Record<string, string> = {
  win32: "%APPDATA%\\the-great-find\\",
  darwin: "~/Library/Application Support/the-great-find/",
  linux: "$XDG_DATA_HOME/the-great-find/",
};

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { data: notifSettings } = useNotificationSettings();
  const saveNotif = useSaveNotificationSettings();

  const bridge = typeof window !== "undefined" ? window.tgf : undefined;
  const isElectron = !!bridge?.isElectron;

  const [dataDir, setDataDir] = useState<string | undefined>(undefined);
  const [platform, setPlatform] = useState<string | undefined>(undefined);
  const [osNotifs, setOsNotifs] = useState<boolean | undefined>(undefined);
  const [pendingDir, setPendingDir] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!bridge) return;
    void bridge.getDataDir().then(setDataDir);
    void bridge.getPlatform().then(setPlatform);
    void bridge.getOsNotifications().then(setOsNotifs);
  }, [bridge]);

  const platformDefault = PLATFORM_DEFAULTS[platform ?? "linux"] ?? "";
  const currentDir = dataDir ?? platformDefault;

  const isEmailConfigured = Boolean(notifSettings?.smtp_host);
  const activeTheme = THEMES.find((t) => t.id === theme);

  const baseForm: NotificationSettings = useMemo(
    () => ({
      smtp_host: notifSettings?.smtp_host ?? "",
      smtp_port: notifSettings?.smtp_port ?? 587,
      smtp_username: notifSettings?.smtp_username ?? "",
      smtp_password: notifSettings?.smtp_password ?? "",
      from_addr: notifSettings?.from_addr ?? "",
      to_addr: notifSettings?.to_addr ?? "",
    }),
    [notifSettings],
  );

  const [editedForm, setEditedForm] = useState<NotificationSettings | null>(null);
  const form = editedForm ?? baseForm;
  const dirty = editedForm !== null;

  function handleChange(key: keyof NotificationSettings, value: string | number) {
    setEditedForm((prev) => ({ ...(prev ?? baseForm), [key]: value }));
  }

  function handleSave() {
    saveNotif.mutate(form, { onSuccess: () => setEditedForm(null) });
  }

  const pickDir = async () => {
    const picked = await bridge?.pickDirectory();
    if (picked && picked !== currentDir) setPendingDir(picked);
  };

  const confirmDir = async () => {
    if (!pendingDir) return;
    await bridge?.setDataDir(pendingDir);
    setDataDir(pendingDir);
    setPendingDir(undefined);
  };

  const toggleOsNotifs = async (next: boolean) => {
    setOsNotifs(next);
    await bridge?.setOsNotifications(next);
  };

  return (
    <>
      <Topbar title="Settings" subtitle="App configuration & info" />

      <div className="flex-1 overflow-auto px-6 py-6">
        <ConfigStrip
          themeLabel={activeTheme?.label ?? "—"}
          themeSwatch={activeTheme?.swatches[2] ?? "transparent"}
          dataDir={currentDir}
          emailConfigured={isEmailConfigured}
          osNotifs={osNotifs}
        />

        <div className="mt-8 space-y-10">
          <Section title="Appearance" description="Pick the visual skin for the dashboard.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {THEMES.map((t) => {
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    aria-pressed={active}
                    className={`group relative flex flex-col gap-4 rounded-[var(--radius-card)] border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
                      active
                        ? "border-[var(--color-accent)] bg-[var(--color-bg-elev)]"
                        : "border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] hover:border-[var(--color-text-muted)]"
                    }`}
                  >
                    <div
                      aria-hidden
                      className="h-16 w-full overflow-hidden rounded-[calc(var(--radius-card)-0.25rem)] border border-[var(--color-border-subtle)]"
                      style={{ background: t.swatches[0] }}
                    >
                      <div className="flex h-full w-full items-center gap-1.5 px-3">
                        {t.swatches.slice(1).map((c, i) => (
                          <span
                            key={i}
                            className="h-6 flex-1 rounded-sm"
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                          {t.label}
                        </div>
                        <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                          {t.description}
                        </div>
                      </div>
                      {active && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-accent)]/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-[var(--color-accent)]">
                          <Check className="h-3 w-3" />
                          Active
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section
            title="Data"
            description={
              isElectron
                ? "Where the SQLite database and app data live on disk."
                : "In browser dev mode the backend uses THE_GREAT_FIND_DATA_DIR from the environment."
            }
          >
            <Card>
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <FieldLabel>Current directory</FieldLabel>
                    <div className="flex items-start gap-2 rounded-[var(--radius-button)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-3 py-2">
                      <Folder className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
                      <code className="min-w-0 flex-1 break-all font-mono text-sm text-[var(--color-text-primary)]">
                        {currentDir || "—"}
                      </code>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {dataDir
                        ? "Custom override in effect."
                        : "Using the platform default. Changes apply on next launch."}
                    </p>
                  </div>
                  {isElectron ? (
                    <Button variant="secondary" size="sm" onClick={pickDir}>
                      Choose folder…
                    </Button>
                  ) : (
                    <span className="rounded-full border border-[var(--color-border-subtle)] px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                      Desktop only
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Section>

          <Section
            title="Notifications"
            description="OS alerts fire on every match. Email is optional and never leaves your machine."
            aside={
              <StatusPill
                tone={isEmailConfigured ? "success" : "muted"}
                label={isEmailConfigured ? "Email configured" : "Email not configured"}
              />
            }
          >
            <div className="space-y-4">
              {isElectron && (
                <Card>
                  <CardContent className="flex items-center justify-between gap-4 p-5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--color-text-primary)]">
                        OS notifications
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                        Fires on every alert match and poll failure.
                      </p>
                    </div>
                    <Toggle
                      checked={osNotifs ?? true}
                      onChange={toggleOsNotifs}
                      label="Toggle OS notifications"
                    />
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="space-y-5 p-5">
                  <div>
                    <div className="text-sm font-medium text-[var(--color-text-primary)]">
                      Email (SMTP)
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
                      Sent via your own SMTP credentials — nothing is stored outside this
                      machine. Gmail users: use an App Password (Google Account → Security).
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field
                      label="SMTP host"
                      placeholder="smtp.gmail.com"
                      value={form.smtp_host}
                      onChange={(v) => handleChange("smtp_host", v)}
                    />
                    <Field
                      label="Port"
                      placeholder="587"
                      inputMode="numeric"
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

                  <SaveBar
                    dirty={dirty}
                    pending={saveNotif.isPending}
                    success={saveNotif.isSuccess && !dirty}
                    error={saveNotif.isError}
                    onSave={handleSave}
                    onDiscard={() => setEditedForm(null)}
                  />
                </CardContent>
              </Card>
            </div>
          </Section>

          <Section title="About" description="What this app is and where it runs.">
            <Card>
              <CardContent className="grid grid-cols-1 gap-x-6 gap-y-3 p-5 sm:grid-cols-2">
                <InfoRow k="App" v="the great find" />
                <InfoRow k="Bind" v="127.0.0.1 only" />
                <InfoRow k="Mode" v="Single-user, single-binary" />
                <InfoRow k="Auth" v="OS user account is the boundary" />
                <InfoRow k="Storage" v="modernc.org/sqlite (CGO-free)" />
                <InfoRow k="Currency" v="EUR — peg 1 EUR = 1.95583 BGN" />
              </CardContent>
            </Card>
          </Section>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDir !== undefined}
        onClose={() => setPendingDir(undefined)}
        onConfirm={() => void confirmDir()}
        title="Change data directory?"
        description={
          <div className="space-y-3">
            <p>The database location will change on next launch. Your current data stays where it is.</p>
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
                From
              </div>
              <code className="block break-all rounded-[var(--radius-button)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-3 py-2 font-mono text-xs">
                {currentDir || "—"}
              </code>
            </div>
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
                To
              </div>
              <code className="block break-all rounded-[var(--radius-button)] border border-[var(--color-accent)] bg-[var(--color-bg-base)] px-3 py-2 font-mono text-xs text-[var(--color-text-primary)]">
                {pendingDir ?? ""}
              </code>
            </div>
          </div>
        }
        tone="default"
        confirmLabel="Apply on next launch"
        cancelLabel="Cancel"
      />
    </>
  );
}

function ConfigStrip({
  themeLabel,
  themeSwatch,
  dataDir,
  emailConfigured,
  osNotifs,
}: {
  themeLabel: string;
  themeSwatch: string;
  dataDir: string;
  emailConfigured: boolean;
  osNotifs: boolean | undefined;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-[var(--color-border-subtle)] pb-4 md:grid-cols-4">
      <ConfigCell label="Theme">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full border border-white/10"
            style={{ background: themeSwatch }}
          />
          <span className="text-[var(--color-text-primary)]">{themeLabel}</span>
        </span>
      </ConfigCell>
      <ConfigCell label="Data dir">
        <span className="block truncate" title={dataDir}>
          {dataDir || "—"}
        </span>
      </ConfigCell>
      <ConfigCell label="OS notifications">
        <span className={osNotifs === false ? "text-[var(--color-text-muted)]" : "text-[var(--color-text-primary)]"}>
          {osNotifs === undefined ? "Always on" : osNotifs ? "On" : "Off"}
        </span>
      </ConfigCell>
      <ConfigCell label="Email">
        <span className={emailConfigured ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"}>
          {emailConfigured ? "Configured" : "Not configured"}
        </span>
      </ConfigCell>
    </dl>
  );
}

function ConfigCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="font-mono text-sm tabular-nums text-[var(--color-text-primary)]">
        {children}
      </dd>
    </div>
  );
}

function Section({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p>
          )}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

function StatusPill({ tone, label }: { tone: "success" | "muted"; label: string }) {
  const cls =
    tone === "success"
      ? "bg-[var(--color-success)]/15 text-[var(--color-success)]"
      : "bg-[var(--color-bg-elev)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${tone === "success" ? "bg-[var(--color-success)]" : "bg-[var(--color-text-muted)]"}`}
      />
      {label}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-base)] ${
        checked
          ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
          : "border-[var(--color-border-subtle)] bg-[var(--color-bg-base)]"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function SaveBar({
  dirty,
  pending,
  success,
  error,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  pending: boolean;
  success: boolean;
  error: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] pt-4">
      <div className="min-h-[1.25rem] text-xs" aria-live="polite">
        {pending && (
          <span className="text-[var(--color-text-muted)]">Saving…</span>
        )}
        {!pending && success && (
          <span className="inline-flex items-center gap-1.5 text-[var(--color-success)]">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
        {!pending && error && (
          <span className="inline-flex items-center gap-1.5 text-[var(--color-danger)]">
            <AlertCircle className="h-3.5 w-3.5" />
            Failed to save — check the values and try again.
          </span>
        )}
        {!pending && !success && !error && dirty && (
          <span className="text-[var(--color-text-muted)]">Unsaved changes</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {dirty && !pending && (
          <Button variant="ghost" size="sm" onClick={onDiscard}>
            Discard
          </Button>
        )}
        <Button
          size="sm"
          onClick={onSave}
          disabled={pending || !dirty}
        >
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
      {children}
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  inputMode,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-[var(--radius-button)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      />
    </label>
  );
}

function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-[var(--color-border-subtle)] py-2 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {k}
      </span>
      <span className="font-mono text-sm text-[var(--color-text-primary)]">{v}</span>
    </div>
  );
}
