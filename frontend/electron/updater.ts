// Auto-updater — checks GitHub Releases on startup and every 6 hours.
//
// Platform behaviour:
//   - Linux (AppImage) : full auto-download + install cycle via
//                        electron-updater. If `cosign` is on PATH, the
//                        downloaded artifact is verified against its
//                        `.sigstore.json` bundle before install — signature
//                        must be tied to this repo's release workflow.
//                        If cosign isn't installed, install proceeds
//                        anyway with a console warning.
//   - Windows / macOS  : notify-only. Unsigned installers can't be silently
//                        applied by electron-updater on these platforms
//                        (SmartScreen re-warns, Gatekeeper blocks), so
//                        auto-download is pointless friction. We just tell
//                        the user a new version is out and open the
//                        Releases page on click.
//                        Tracked for future v2 work when code-signing
//                        certs are in place:
//                        https://github.com/Hari-Hristov/the-great-find/issues/52

import { app, dialog, Notification, shell } from "electron";
import pkg from "electron-updater";
const { autoUpdater } = pkg;
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import https from "node:https";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const RELEASES_URL = "https://github.com/Hari-Hristov/the-great-find/releases/latest";
const REPO_OWNER = "Hari-Hristov";
const REPO_NAME = "the-great-find";

// Regex that must match the workflow_ref claim in the Sigstore signing cert.
// Ties valid signatures to release.yml on this repo, tagged with a v* ref.
const IDENTITY_REGEX =
  /^https:\/\/github\.com\/Hari-Hristov\/the-great-find\/\.github\/workflows\/release\.yml@refs\/tags\/v.+/;
const OIDC_ISSUER = "https://token.actions.githubusercontent.com";

export function initAutoUpdater(): void {
  if (!app.isPackaged) return;

  if (process.platform === "linux") {
    startElectronUpdater();
  } else {
    // Notify-only path — just poll GitHub's public releases API for a
    // newer semver than app.getVersion() and post a notification.
    void checkNotifyOnly();
    setInterval(() => {
      void checkNotifyOnly();
    }, CHECK_INTERVAL_MS);
  }
}

function startElectronUpdater(): void {
  autoUpdater.autoDownload = true;
  // Never silently `quitAndInstall` — we want to verify the signature
  // first and prompt the user before restarting.
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("error", (err) => {
    console.warn("[updater] error:", err);
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[updater] update available:", info.version);
  });

  autoUpdater.on("update-downloaded", (info) => {
    void handleUpdateDownloaded(info.version);
  });

  autoUpdater.checkForUpdates().catch((err) => {
    console.warn("[updater] initial check failed:", err);
  });
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn("[updater] scheduled check failed:", err);
    });
  }, CHECK_INTERVAL_MS);
}

async function handleUpdateDownloaded(version: string): Promise<void> {
  // The download path is discoverable from the emitted event's `downloadedFile`
  // in newer electron-updater versions, but the type isn't stable across
  // 6.x — grab it via the internal API instead.
  const downloadedPath = (autoUpdater as unknown as { downloadedUpdateHelper?: { file?: string } })
    .downloadedUpdateHelper?.file;

  let verifyResult: "ok" | "cosign-missing" | "failed" = "cosign-missing";
  if (downloadedPath && existsSync(downloadedPath)) {
    verifyResult = await verifySigstoreBundle(downloadedPath);
  } else {
    console.warn("[updater] could not resolve downloaded file path — skipping verify");
  }

  const buttons =
    verifyResult === "failed"
      ? ["Cancel"]
      : ["Restart & install", "Later"];

  const detail =
    verifyResult === "ok"
      ? `Version ${version} is ready. Signature verified against the release pipeline's identity.`
      : verifyResult === "cosign-missing"
        ? `Version ${version} is ready. cosign is not installed — signature could NOT be verified locally. Install cosign (https://docs.sigstore.dev) for verified updates.`
        : `Version ${version} was downloaded but its Sigstore signature FAILED to verify. The update will NOT be installed. Report this at ${RELEASES_URL.replace(/\/latest$/, "")}/issues.`;

  const result = await dialog.showMessageBox({
    type: verifyResult === "failed" ? "error" : "info",
    title: "The Great Find — update available",
    message: verifyResult === "failed" ? "Update signature mismatch" : "Update ready to install",
    detail,
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
  });

  if (verifyResult !== "failed" && result.response === 0) {
    autoUpdater.quitAndInstall();
  }
}

// Runs `cosign verify-blob` against the downloaded artifact. Requires
// cosign on PATH. Returns "cosign-missing" if we can't find it —
// the caller decides how to handle that.
function verifySigstoreBundle(
  artifactPath: string,
): Promise<"ok" | "cosign-missing" | "failed"> {
  return new Promise((resolve) => {
    const bundlePath = `${artifactPath}.sigstore.json`;
    if (!existsSync(bundlePath)) {
      // The bundle should have been downloaded alongside the artifact by
      // electron-updater's file-picker (it fetches everything listed in
      // latest-linux.yml). If it's missing, treat as verify failure —
      // this is a signal that the release is malformed or the update
      // channel has been tampered with.
      console.warn("[updater] .sigstore.json bundle missing next to", artifactPath);
      resolve("failed");
      return;
    }

    const proc = spawn(
      "cosign",
      [
        "verify-blob",
        "--bundle",
        bundlePath,
        "--certificate-identity-regexp",
        IDENTITY_REGEX.source,
        "--certificate-oidc-issuer",
        OIDC_ISSUER,
        artifactPath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    proc.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        console.warn("[updater] cosign not found on PATH — skipping signature verify");
        resolve("cosign-missing");
      } else {
        console.warn("[updater] cosign spawn error:", err);
        resolve("failed");
      }
    });

    proc.on("exit", (code) => {
      if (code === 0) {
        console.log("[updater] cosign verify OK for", path.basename(artifactPath));
        resolve("ok");
      } else {
        console.warn(
          "[updater] cosign verify FAILED (exit",
          code,
          "):",
          stderr.trim(),
        );
        resolve("failed");
      }
    });
  });
}

// Notify-only path for Windows and macOS: fetch the latest release tag
// from GitHub's public API, compare against app.getVersion(), post an
// OS notification if newer. Zero download, zero install.
async function checkNotifyOnly(): Promise<void> {
  try {
    const latest = await fetchLatestReleaseTag();
    if (!latest) return;
    const latestVer = latest.replace(/^v/, "");
    const currentVer = app.getVersion();
    if (compareSemver(latestVer, currentVer) <= 0) return;

    const n = new Notification({
      title: "The Great Find — update available",
      body: `Version ${latestVer} is out (you have ${currentVer}). Click to download.`,
      silent: false,
    });
    n.on("click", () => {
      void shell.openExternal(RELEASES_URL);
    });
    n.show();
  } catch (err) {
    console.warn("[updater] notify-only check failed:", err);
  }
}

function fetchLatestReleaseTag(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `the-great-find/${app.getVersion()}`,
        },
        timeout: 10_000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body) as { tag_name?: string };
            resolve(parsed.tag_name ?? null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

// Minimal semver comparator — returns negative if a<b, 0 if equal,
// positive if a>b. Non-numeric segments compared lexically. Good enough
// for "is this newer than what I have" — full semver isn't worth pulling
// a dep for.
function compareSemver(a: string, b: string): number {
  const parse = (v: string) => v.split(/[.-]/).map((s) => (/^\d+$/.test(s) ? Number(s) : s));
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x).localeCompare(String(y));
  }
  return 0;
}
