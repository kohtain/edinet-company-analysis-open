// Render existing directory URL metadata without migrating Japan IR Navi snapshots.
// The directory is untrusted input; never render arbitrary schemes or local URLs.
export function normalizeOfficialIrUrl(value) {
 if (typeof value !== 'string' || value.length > 2048 || value !== value.trim()) return null;
 try {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) return null;
  if (!/^[a-z0-9.-]+$/i.test(u.hostname) || !u.hostname.includes('.') ||
      u.hostname.endsWith('.') || u.hostname.startsWith('.') ||
      u.hostname === 'localhost' || u.hostname.endsWith('.localhost')) return null;
  // IP literals and single-label internal hosts are never official IR links.
  if (/^\d+(?:\.\d+){3}$/.test(u.hostname) || u.hostname.includes(':')) return null;
  return u.href;
 } catch {
  return null;
 }
}
