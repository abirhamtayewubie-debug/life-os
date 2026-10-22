/**
 * Push endpoints come from the browser, but the server POSTs to them, so only
 * the browser vendors' push services are accepted (no requests to arbitrary
 * hosts). A local test service is allowed only when PUSH_TEST_ENDPOINTS=1.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^(.+\.)?push\.apple\.com$/,
  /^(.+\.)?notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string, allowLocal = false): boolean {
  let url: URL;
  try { url = new URL(endpoint); } catch { return false; }
  if (allowLocal && url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")) return true;
  return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((h) => h.test(url.hostname));
}

/** "Chrome on macOS" style label from a user agent, for the device list. */
export function deviceLabel(ua: string): string {
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

/** Retry delays for a failed delivery, in minutes; after the last one it's marked failed. */
export const RETRY_MINUTES = [1, 2, 4, 8, 16];
