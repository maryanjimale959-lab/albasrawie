import os from "os";

/** First private IPv4 address of this machine (e.g. 192.168.x.x). */
export function lanAddress() {
  try {
    const nets = os.networkInterfaces();
    const candidates = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        const ipv4 = net.family === "IPv4" || net.family === 4;
        if (!ipv4 || net.internal) continue;
        candidates.push(net.address);
      }
    }
    return (
      candidates.find((ip) => /^192\.168\./.test(ip)) ||
      candidates.find((ip) => /^10\./.test(ip)) ||
      candidates.find((ip) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) ||
      candidates[0] ||
      null
    );
  } catch {
    return null;
  }
}

/**
 * Build a shareable origin from the incoming request headers.
 * Requests arriving over localhost are rewritten to this machine's LAN IP so
 * the link/QR opens on phones and tablets on the same network.
 */
export function publicOrigin(h) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const proto = (h && h.get("x-forwarded-proto")) || "http";
  const host = (h && h.get("host")) || "localhost:3000";
  return `${proto}://${host}`;
}
