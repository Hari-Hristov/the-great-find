# The Great Find — Install Notes

The Great Find is unsigned in v1 (no Apple Developer cert, no Windows EV
cert). The app is open-source and you can verify the binary against the
public release artifacts on GitHub.

## Windows (.exe)

1. Double-click `The-Great-Find-Setup-<version>.exe`.
2. Windows SmartScreen will warn: **"Windows protected your PC"**.
3. Click **More info** → **Run anyway**.
4. The installer runs normally. Pick an install location, optionally create
   a desktop shortcut, finish.

The app lives in your Start Menu under `The Great Find`. On first launch
it tucks itself into the system tray; left-click the tray icon to bring up
the dashboard.

## macOS (.dmg)

The `.dmg` is a universal binary — it works on both Apple Silicon and
Intel Macs.

1. Double-click `The-Great-Find-<version>-universal.dmg`.
2. Drag **The Great Find** into the **Applications** folder.
3. The first launch macOS will refuse with:
   > "The Great Find" cannot be opened because the developer cannot be verified.

   **One-time fix:** right-click the app in Applications → **Open**.
   macOS will ask you to confirm; the app launches and Gatekeeper
   remembers the exception for future launches.

   **Or, from a terminal:**
   ```sh
   xattr -dr com.apple.quarantine "/Applications/The Great Find.app"
   ```

The app is a menu-bar utility (`LSUIElement=true`) — there is no Dock
icon. The dashboard is reachable via the menu-bar tray icon at the top of
the screen.

## Linux (AppImage)

```sh
chmod +x The-Great-Find-<version>-x86_64.AppImage
./The-Great-Find-<version>-x86_64.AppImage
```

The AppImage is self-contained — no install step. You can move it
anywhere, including a system path like `~/Applications/`. To make it
appear in your desktop environment's app launcher, install
[AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) or
move the AppImage into `~/Applications/` and let your DE pick it up.

A tray icon will appear in the system tray when the app is running.
Tray support depends on your desktop environment — works out of the box
on KDE, XFCE, Cinnamon; GNOME requires the `AppIndicator` extension.

## Where the database lives

The app stores a SQLite database (`the-great-find.db`) in the OS-conventional
location:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\the-great-find\` |
| macOS | `~/Library/Application Support/the-great-find/` |
| Linux | `$XDG_DATA_HOME/the-great-find/` (or `~/.local/share/the-great-find/`) |

You can change this from the first-run wizard or by editing the app's
config file at `<userData>/config.json`. Changes apply on next launch —
your existing data stays in its original location.

## Verifying the binary

Every release ships a `.sigstore.json` bundle **and** a `SHA256SUMS-<platform>.txt`
alongside each installer. Two layers of defence:

- **SHA-256** defeats tampering in transit (e.g. a corrupted download).
- **Sigstore** defeats tampering at rest — even if someone hijacks the
  GitHub repo and swaps the installer, they cannot forge a valid
  Sigstore signature without also compromising the GitHub Actions
  release pipeline itself. The signature is tied to this exact repo,
  workflow file, and tag ref.

### Quick check — SHA-256 only

**Windows** (PowerShell):
```powershell
Get-FileHash .\The-Great-Find-Setup-<version>.exe -Algorithm SHA256
# Compare the hash against SHA256SUMS-win.txt
```

**macOS / Linux**:
```sh
shasum -a 256 -c SHA256SUMS-mac.txt      # macOS
shasum -a 256 -c SHA256SUMS-linux.txt    # Linux
```

Should print `OK`. Anything else = do not install, open an issue.

### Real check — Sigstore signature verification (recommended)

Install cosign once: [sigstore.dev/downloads](https://docs.sigstore.dev/system_config/installation/).
Then verify each installer against the bundle that ships with it:

```sh
cosign verify-blob \
  --bundle The-Great-Find-Setup-<version>.exe.sigstore.json \
  --certificate-identity-regexp "^https://github.com/Hari-Hristov/the-great-find/\.github/workflows/release\.yml@refs/tags/v.*" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  The-Great-Find-Setup-<version>.exe
```

Should print `Verified OK`. If verification fails, the binary was not
built by this repo's release pipeline — do not install, open an issue.

The full source is at https://github.com/Hari-Hristov/the-great-find —
you can build from source yourself with `bash scripts/build.sh` if you
prefer.

## Quitting

Closing the main window only hides it — the app keeps polling from the
tray. To fully quit:

- **Windows / Linux**: right-click the tray icon → **Quit**.
- **macOS**: click the menu-bar icon → **Quit**.

## Updates

There is no auto-update mechanism in v1. Check the
[Releases page](https://github.com/Hari-Hristov/the-great-find/releases)
periodically for new versions. Your database persists across versions —
upgrading is just installing the new binary.
