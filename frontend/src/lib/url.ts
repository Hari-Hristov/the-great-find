// URL safety helpers.
//
// Listing URLs come from the scraper — they're pulled from olx.bg pages,
// which are attacker-influenceable content. A malicious listing could set
// its URL to `javascript:...` or `data:text/html,...`; if that flows into
// an <a href={url}> without a scheme check, clicking would execute the
// script in the renderer.
//
// The Electron main process already restricts `shell.openExternal` +
// `will-navigate` to http/https, so today the attack is neutralised at the
// navigation layer. This helper is defense-in-depth at the render layer so
// the two defences don't share a single point of failure.

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Returns the URL if it's an http/https URL, or `"#"` otherwise.
 *
 * `null` / `undefined` / empty / non-parseable / non-http(s) all collapse
 * to `"#"` so the anchor renders as an inert link rather than becoming a
 * `javascript:` execution surface.
 */
export function safeHref(raw: string | null | undefined): string {
  if (!raw) return "#";
  try {
    const parsed = new URL(raw);
    return ALLOWED_PROTOCOLS.has(parsed.protocol) ? raw : "#";
  } catch {
    return "#";
  }
}
