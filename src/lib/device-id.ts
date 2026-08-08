/**
 * Stable per-browser device id, stored in localStorage.
 * Used to detect one login being shared across many people/devices.
 */
const KEY = "qf_device_id";

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && existing.length >= 8) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Private mode / storage blocked — fall back to a per-tab id.
    return `eph_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

/** Short, human-readable device description for the account page. */
export function describeDevice(userAgent: string): string {
  const ua = userAgent || "";
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/i.test(ua)
    ? "Mac"
    : /iPhone|iPad/i.test(ua)
    ? "iOS"
    : /Android/i.test(ua)
    ? "Android"
    : /Linux/i.test(ua)
    ? "Linux"
    : "Unknown OS";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /Chrome\//i.test(ua) && !/Chromium/i.test(ua)
    ? "Chrome"
    : /Safari\//i.test(ua) && !/Chrome/i.test(ua)
    ? "Safari"
    : /Firefox\//i.test(ua)
    ? "Firefox"
    : "Browser";
  return `${browser} on ${os}`;
}
