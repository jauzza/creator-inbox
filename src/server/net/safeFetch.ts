import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import type { LookupFunction } from "node:net";

/**
 * Outbound HTTP for owner-configurable URLs (AI base URL, provider base URL, Telegram).
 * Defences: https only, port 443 only, no URL credentials, no redirects, DNS answers checked
 * at connect time (defeats DNS rebinding), timeouts, response size cap.
 */

export class SafeFetchError extends Error {
  constructor(
    message: string,
    public readonly kind: "blocked" | "timeout" | "network" | "too_large",
  ) {
    super(message);
  }
}

export type HttpResponse = { status: number; headers: Record<string, string>; text: string };
export type HttpRequest = {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  /** If set, the hostname must be one of these (exact match). */
  allowHosts?: string[];
};
export type Transport = (req: HttpRequest) => Promise<HttpResponse>;

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local / cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast + reserved
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith("64:ff9b:") || v.startsWith("2001:db8");
  }
  return true;
}

export function validateOutboundUrl(raw: string, allowHosts?: string[]): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SafeFetchError("Invalid URL", "blocked");
  }
  if (u.protocol !== "https:") throw new SafeFetchError("Only https:// URLs are allowed", "blocked");
  if (u.username || u.password) throw new SafeFetchError("URLs with embedded credentials are not allowed", "blocked");
  if (u.port && u.port !== "443") throw new SafeFetchError("Only the default https port is allowed", "blocked");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && isPrivateAddress(host)) throw new SafeFetchError("Private or internal addresses are not allowed", "blocked");
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host))
    throw new SafeFetchError("Internal hostnames are not allowed", "blocked");
  if (allowHosts && !allowHosts.includes(host)) throw new SafeFetchError(`Host ${host} is not in the allow-list for this integration`, "blocked");
  return u;
}

const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return (callback as any)(err);
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (bad || list.length === 0) return (callback as any)(new SafeFetchError(`Resolved to a blocked address`, "blocked"));
    if ((options as any)?.all) return (callback as any)(null, list);
    (callback as any)(null, list[0].address, list[0].family);
  });
};

const realTransport: Transport = (req) =>
  new Promise((resolve, reject) => {
    const u = validateOutboundUrl(req.url, req.allowHosts);
    const maxBytes = req.maxBytes ?? 2_000_000;
    const r = https.request(
      u,
      { method: req.method ?? "GET", headers: req.headers, lookup: guardedLookup, timeout: req.timeoutMs ?? 20000 },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            r.destroy(new SafeFetchError("Response too large", "too_large"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers[k] = Array.isArray(v) ? v.join(", ") : v;
          resolve({ status: res.statusCode ?? 0, headers, text: Buffer.concat(chunks).toString("utf8") });
        });
        res.on("error", reject);
      },
    );
    r.on("timeout", () => r.destroy(new SafeFetchError("Request timed out", "timeout")));
    r.on("error", (e) => reject(e instanceof SafeFetchError ? e : new SafeFetchError(e.message, "network")));
    if (req.body) r.write(req.body);
    r.end();
  });

let transport: Transport = realTransport;

/** Never follows redirects: a 3xx is returned to the caller, who treats it as an error. */
export function safeFetch(req: HttpRequest): Promise<HttpResponse> {
  validateOutboundUrl(req.url, req.allowHosts);
  return transport(req);
}

/** Test hook: replace the network layer. */
export function setTransport(t: Transport | null) {
  transport = t ?? realTransport;
}
