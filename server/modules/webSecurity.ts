import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { LookupFunction } from "node:net";
import type { Readable } from "node:stream";

export class WebSecurityError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly publicMessage: string;

  constructor(status: number, code: string, publicMessage: string) {
    super(publicMessage);
    this.name = "WebSecurityError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowedContentTypes?: string[]; // prefixes or exact mime types without params
  headers?: Record<string, string>;
  method?: "GET" | "HEAD";
}

export interface SafeFetchResult {
  url: string; // final validated URL
  status: number;
  headers: Headers;
  buffer: Buffer;
  contentType: string;
}

export interface ValidatedResolvedAddress {
  address: string;
  family: 4 | 6;
}

const DEFAULT_MAX_REDIRECTS = Math.max(
  0,
  Number(process.env.WEB_FETCH_MAX_REDIRECTS || 5)
);
const DEFAULT_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.WEB_INSPECT_TIMEOUT_MS || 8000)
);
const DEFAULT_MAX_BYTES = Math.max(
  1024,
  Number(process.env.WEB_INSPECT_MAX_BYTES || 2_000_000)
);

function toPublicError(code: string, publicMessage: string, status = 400): WebSecurityError {
  return new WebSecurityError(status, code, publicMessage);
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function isLocalOrInternalHostname(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".home.arpa") ||
    h === "ip6-localhost" ||
    h === "ip6-loopback"
  );
}

function hasAmbiguousIpEncoding(rawHostname: string): boolean {
  // Reject obvious ambiguous/encoded forms; URL parser normalizes some cases but we stay conservative.
  const h = rawHostname.trim().toLowerCase();
  if (!h) return false;
  if (h.includes("%")) return true; // percent-encoding or IPv6 zone ids in host context
  // Hex/octal/integer IPv4-like forms are ambiguous across resolvers/parsers; allow only dotted-decimal or valid IPv6 literals.
  if (/^0x[0-9a-f]+$/i.test(h)) return true;
  if (/^\d+$/.test(h)) return true;
  if (/^0[0-7]+(\.0[0-7]+){1,3}$/.test(h)) return true;
  return false;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    if (p.length > 1 && p.startsWith("0")) return null; // reject octal-like ambiguity
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

function inCidrV4(ip: string, base: string, prefix: number): boolean {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function ipv4FromBigInt(v4: number): string {
  return `${(v4 >>> 24) & 0xff}.${(v4 >>> 16) & 0xff}.${(v4 >>> 8) & 0xff}.${v4 & 0xff}`;
}

function isGloballyRoutableIpv4(ip: string): boolean {
  if (net.isIP(ip) !== 4) return false;
  // Special-purpose / non-globally-routable IPv4 blocks (IANA special-purpose registry, multicast, reserved)
  const nonGlobalCidrs: Array<[string, number]> = [
    ["0.0.0.0", 8],          // "This network"
    ["10.0.0.0", 8],         // Private-Use
    ["100.64.0.0", 10],      // Shared Address Space (CGNAT)
    ["127.0.0.0", 8],        // Loopback
    ["169.254.0.0", 16],     // Link Local
    ["172.16.0.0", 12],      // Private-Use
    ["192.0.0.0", 24],       // IETF Protocol Assignments (incl. DS-Lite, NAT64/DNS64 discovery, etc.)
    ["192.0.2.0", 24],       // Documentation (TEST-NET-1)
    ["192.31.196.0", 24],    // AS112-v4
    ["192.52.193.0", 24],    // AMT
    ["192.88.99.0", 24],     // Deprecated 6to4 Relay Anycast
    ["192.168.0.0", 16],     // Private-Use
    ["192.175.48.0", 24],    // Direct Delegation AS112
    ["198.18.0.0", 15],      // Benchmarking
    ["198.51.100.0", 24],    // Documentation (TEST-NET-2)
    ["203.0.113.0", 24],     // Documentation (TEST-NET-3)
    ["224.0.0.0", 4],        // Multicast
    ["240.0.0.0", 4],        // Reserved for Future Use (+ limited broadcast 255.255.255.255/32)
  ];
  if (nonGlobalCidrs.some(([base, prefix]) => inCidrV4(ip, base, prefix))) return false;
  return true;
}

function parseIpv6ToBigInt(ip: string): bigint | null {
  try {
    let input = ip.toLowerCase().trim();
    if (!input) return null;
    // Zone identifiers are ambiguous in URL/socket contexts; refuse.
    if (input.includes("%")) return null;
    if (input.includes(".")) {
      // IPv4-embedded tail: expand last 32 bits (e.g. ::ffff:127.0.0.1)
      const lastColon = input.lastIndexOf(":");
      if (lastColon === -1) return null;
      const v4 = input.slice(lastColon + 1);
      const v4Int = ipv4ToInt(v4);
      if (v4Int === null) return null;
      const high = ((v4Int >>> 16) & 0xffff).toString(16);
      const low = (v4Int & 0xffff).toString(16);
      input = `${input.slice(0, lastColon)}:${high}:${low}`;
    }
    const parts = input.split("::");
    if (parts.length > 2) return null;
    const left = parts[0] ? parts[0].split(":").filter((p) => p.length > 0) : [];
    const right = parts.length === 2 && parts[1] ? parts[1].split(":").filter((p) => p.length > 0) : [];
    if (parts.length === 1 && left.length !== 8) {
      // no compression but not 8 hextets
      // (left computed from non-empty split; allow full form)
    }
    const fillCount = parts.length === 2 ? 8 - (left.length + right.length) : 0;
    if (fillCount < 0) return null;
    const full = parts.length === 2 ? [...left, ...Array(fillCount).fill("0"), ...right] : input.split(":");
    if (full.length !== 8) return null;
    let value = 0n;
    for (const hextet of full) {
      if (!/^[0-9a-f]{1,4}$/i.test(hextet)) return null;
      value = (value << 16n) + BigInt(parseInt(hextet, 16));
    }
    return value;
  } catch {
    return null;
  }
}

function bigIntToIpv6(value: bigint): string {
  const parts: string[] = [];
  for (let i = 7; i >= 0; i--) {
    const shift = BigInt(i * 16);
    parts.push(((value >> shift) & 0xffffn).toString(16));
  }
  return parts.join(":");
}

function inCidrV6Value(ipValue: bigint, baseValue: bigint, prefix: number): boolean {
  if (prefix <= 0) return true;
  if (prefix > 128) return false;
  const shift = BigInt(128 - prefix);
  return (ipValue >> shift) === (baseValue >> shift);
}

function inCidrV6(ip: string, base: string, prefix: number): boolean {
  const ipInt = parseIpv6ToBigInt(ip);
  const baseInt = parseIpv6ToBigInt(base);
  if (ipInt === null || baseInt === null) return false;
  return inCidrV6Value(ipInt, baseInt, prefix);
}

function extractMappedIpv4FromValue(ipValue: bigint): string | null {
  // IPv4-mapped IPv6: ::ffff:0:0/96
  const baseMapped = parseIpv6ToBigInt("::ffff:0:0");
  if (baseMapped !== null && inCidrV6Value(ipValue, baseMapped, 96)) {
    const v4 = Number(ipValue & 0xffffffffn);
    return ipv4FromBigInt(v4 >>> 0);
  }
  return null;
}

function isGloballyRoutableIpv6(ip: string): boolean {
  if (net.isIP(ip) !== 6) return false;
  if (ip.includes("%")) return false; // zone id = ambiguous / non-global context
  const v = parseIpv6ToBigInt(ip);
  if (v === null) return false; // ambiguous/unparseable -> refuse

  // IPv4-mapped IPv6 addresses: evaluate embedded IPv4 global routability.
  const mappedV4 = extractMappedIpv4FromValue(v);
  if (mappedV4) {
    return isGloballyRoutableIpv4(mappedV4);
  }

  // Deprecated IPv4-compatible IPv6 ::/96 (except :: and ::1 handled below as special) -> not globally routable.
  const baseCompat = 0n;
  if (inCidrV6Value(v, baseCompat, 96)) {
    // ::/128 unspecified, ::1/128 loopback (both not global); others deprecated/ambiguous
    return false;
  }

  // Known special / non-globally-routable IPv6 prefixes.
  const nonGlobalCidrs: Array<[string, number]> = [
    ["::", 128],         // Unspecified
    ["::1", 128],        // Loopback
    ["fc00::", 7],       // Unique Local
    ["fe80::", 10],      // Link-Local
    ["ff00::", 8],       // Multicast
    ["64:ff9b::", 96],   // NAT64 well-known prefix (embedded IPv4; conservative refuse)
    ["64:ff9b:1::", 48], // NAT64 local-use
    ["100::", 64],       // Discard-Only
    ["2001::", 32],      // Teredo (special/tunneling)
    ["2001:2::", 48],    // Benchmarking
    ["2001:3::", 32],    // AMT
    ["2001:4:112::", 48],// AS112-v6
    ["2001:10::", 28],   // Deprecated ORCHID
    ["2001:20::", 28],   // ORCHIDv2
    ["2001:db8::", 32],  // Documentation
    ["2002::", 16],      // 6to4 (deprecated, embeds IPv4)
    ["2620:4f:8000::", 48], // Direct Delegation AS112 (special-use)
    ["3fff::", 20],      // Documentation (RFC 9637)
    ["5f00::", 16],      // Segment Routing (SRv6) SIDs, not general global unicast endpoint here; conservative refuse
  ];
  for (const [base, prefix] of nonGlobalCidrs) {
    const b = parseIpv6ToBigInt(base);
    if (b !== null && inCidrV6Value(v, b, prefix)) return false;
  }

  // Require current Global Unicast space (2000::/3). If not in 2000::/3, treat as non-global/ambiguous -> refuse.
  const baseGlobal = parseIpv6ToBigInt("2000::");
  if (baseGlobal === null || !inCidrV6Value(v, baseGlobal, 3)) return false;

  return true;
}

export function isGloballyRoutableIpAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isGloballyRoutableIpv4(ip);
  if (kind === 6) return isGloballyRoutableIpv6(ip);
  return false;
}

// Backward-compatible export name used internally previously; keep as a safe alias.
export function isBlockedIpAddress(ip: string): boolean {
  return !isGloballyRoutableIpAddress(ip);
}

export interface ParsedSafeUrl {
  url: URL;
  normalized: string;
  hostname: string;
}

export function parseAndNormalizeHttpUrl(rawUrl: string): ParsedSafeUrl {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    throw toPublicError("INVALID_URL", "URL invalide. Vérifiez le format (https://...).");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw toPublicError("UNSUPPORTED_PROTOCOL", "Seuls les protocoles http et https sont autorisés.");
  }

  if (parsed.username || parsed.password) {
    throw toPublicError("INVALID_URL", "Les URL contenant des identifiants ne sont pas autorisées.");
  }

  const rawHost = parsed.hostname || "";
  if (hasAmbiguousIpEncoding(rawHost)) {
    throw toPublicError("INVALID_URL", "URL invalide ou ambiguë.");
  }

  const hostname = normalizeHostname(rawHost);
  if (!hostname) {
    throw toPublicError("INVALID_URL", "URL invalide : nom d'hôte manquant.");
  }

  // Reject IPv6 zone identifiers and other ambiguous host forms.
  if (hostname.includes("%")) {
    throw toPublicError("INVALID_URL", "URL invalide ou ambiguë.");
  }

  if (isLocalOrInternalHostname(hostname)) {
    throw toPublicError(
      "FORBIDDEN_DESTINATION",
      "Destination non autorisée : les adresses ou domaines locaux ne sont pas accessibles."
    );
  }

  // If hostname is an IP literal, require it to be globally routable (unicast) or refuse.
  const ipKind = net.isIP(hostname);
  if (ipKind) {
    if (!isGloballyRoutableIpAddress(hostname)) {
      throw toPublicError(
        "FORBIDDEN_DESTINATION",
        "Destination non autorisée : l'adresse indiquée n'est pas publique."
      );
    }
  }

  return { url: parsed, normalized: parsed.toString(), hostname };
}

export async function resolveAndValidatePublicAddresses(hostname: string): Promise<ValidatedResolvedAddress[]> {
  const normalized = normalizeHostname(hostname);
  const ipKind = net.isIP(normalized);
  if (ipKind) {
    if (!isGloballyRoutableIpAddress(normalized)) {
      throw toPublicError(
        "FORBIDDEN_DESTINATION",
        "Destination non autorisée : l'adresse indiquée n'est pas publique."
      );
    }
    return [{ address: normalized, family: ipKind as 4 | 6 }];
  }

  let records: Array<{ address: string; family: number }>;
  try {
    // Controlled DNS resolution performed before any connection attempt.
    records = await dns.lookup(normalized, { all: true, verbatim: true });
  } catch {
    throw toPublicError("DNS_RESOLUTION_FAILED", "Domaine impossible à résoudre.", 400);
  }
  if (!records || records.length === 0) {
    throw toPublicError("DNS_RESOLUTION_FAILED", "Domaine impossible à résoudre.", 400);
  }

  // Refuse if any resolved address is not globally routable/public (prevents mixed/public-private rebinding surfaces).
  const validated: ValidatedResolvedAddress[] = [];
  for (const rec of records) {
    const addr = typeof rec?.address === "string" ? rec.address.trim().toLowerCase() : "";
    const family = rec?.family === 6 ? 6 : rec?.family === 4 ? 4 : (net.isIP(addr) as 4 | 6 | 0);
    if (!addr || (family !== 4 && family !== 6) || !isGloballyRoutableIpAddress(addr)) {
      throw toPublicError(
        "FORBIDDEN_DESTINATION",
        "Destination non autorisée : le domaine ne pointe pas vers une adresse publique."
      );
    }
    // Deduplicate
    if (!validated.some((v) => v.address === addr && v.family === family)) {
      validated.push({ address: addr, family });
    }
  }

  if (validated.length === 0) {
    throw toPublicError(
      "FORBIDDEN_DESTINATION",
      "Destination non autorisée : le domaine ne pointe pas vers une adresse publique."
    );
  }

  // Prefer IPv4 then IPv6 for deterministic pinning.
  validated.sort((a, b) => a.family - b.family);
  return validated;
}

// Backward-compatible helper: ensures hostname resolves only to globally routable/public addresses.
export async function assertHostnameResolvesToPublic(hostname: string): Promise<void> {
  await resolveAndValidatePublicAddresses(hostname);
}

export async function validatePublicHttpUrl(rawUrl: string): Promise<ParsedSafeUrl> {
  const parsed = parseAndNormalizeHttpUrl(rawUrl);
  await assertHostnameResolvesToPublic(parsed.hostname);
  return parsed;
}

function getMimeType(contentTypeHeader: string | string[] | undefined | null): string {
  if (!contentTypeHeader) return "";
  const value = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader;
  return String(value).split(";")[0].trim().toLowerCase();
}

function isAllowedContentType(mime: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  return allowed.some((a) => {
    const rule = a.toLowerCase();
    if (rule.endsWith("/*")) return mime.startsWith(rule.slice(0, -1));
    return mime === rule;
  });
}

function headersToFetchHeaders(nodeHeaders: http.IncomingHttpHeaders): Headers {
  const h = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders || {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) h.append(key, String(v));
    } else {
      h.set(key, String(value));
    }
  }
  return h;
}

async function readNodeBodyWithLimit(stream: Readable, maxBytes: number, contentLengthHeader?: string | string[]): Promise<Buffer> {
  if (contentLengthHeader) {
    const raw = Array.isArray(contentLengthHeader) ? contentLengthHeader[0] : contentLengthHeader;
    const len = Number(raw);
    if (Number.isFinite(len) && len > maxBytes) {
      try { stream.destroy(); } catch { /* ignore */ }
      throw toPublicError("MAX_SIZE_EXCEEDED", "Taille maximale dépassée.", 413);
    }
  }
  const chunks: Buffer[] = [];
  let received = 0;
  return await new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const succeed = (buf: Buffer) => {
      if (settled) return;
      settled = true;
      resolve(buf);
    };
    stream.on("data", (chunk: Buffer | string) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      received += buf.length;
      if (received > maxBytes) {
        try { stream.destroy(); } catch { /* ignore */ }
        fail(toPublicError("MAX_SIZE_EXCEEDED", "Taille maximale dépassée.", 413));
        return;
      }
      chunks.push(buf);
    });
    stream.on("end", () => succeed(Buffer.concat(chunks)));
    stream.on("close", () => {
      // If stream closed without 'end' and not already settled (aborted/destroyed), treat as incomplete.
      // In normal 'end' flow we've already settled.
    });
    stream.on("aborted", () => fail(toPublicError("UNREACHABLE", "Site inaccessible ou ressource indisponible.", 502)));
    stream.on("error", (err) => {
      if (settled) return;
      if (err instanceof WebSecurityError) {
        fail(err);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (/timeout|timed out|ETIMEDOUT|aborted/i.test(msg)) {
        fail(toPublicError("TIMEOUT", "Délai dépassé lors de la récupération de la ressource.", 504));
      } else {
        fail(toPublicError("UNREACHABLE", "Site inaccessible ou ressource indisponible.", 502));
      }
    });
  });
}

interface PinnedRequestResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

async function requestWithPinnedDns(
  target: ParsedSafeUrl,
  pinned: ValidatedResolvedAddress,
  options: {
    method: "GET" | "HEAD";
    timeoutMs: number;
    headers?: Record<string, string>;
    maxBytes: number;
  }
): Promise<PinnedRequestResult> {
  // Enforce that the address we connect to is exactly the pre-validated, pinned one.
  if (!isGloballyRoutableIpAddress(pinned.address) || net.isIP(pinned.address) !== pinned.family) {
    throw toPublicError("FORBIDDEN_DESTINATION", "Destination non autorisée : l'adresse indiquée n'est pas publique.");
  }

  const isHttps = target.url.protocol === "https:";
  const port = target.url.port ? Number(target.url.port) : isHttps ? 443 : 80;
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw toPublicError("INVALID_URL", "URL invalide.");
  }

  const lookup: LookupFunction = (_hostname, options, callback) => {
    // Pin DNS resolution: always return the pre-validated address, never perform a new DNS lookup.
    // Node >= 20 appelle lookup avec { all: true } (autoSelectFamily) : dans ce cas,
    // la callback attend un tableau d'adresses, sinon elle attend (address, family).
    const opts = options as { all?: boolean } | string | undefined;
    const wantsAll = typeof opts === "object" && opts !== null && opts.all === true;
    if (wantsAll) {
      const cb = callback as unknown as (
        err: Error | null,
        addresses: Array<{ address: string; family: number }>
      ) => void;
      cb(null, [{ address: pinned.address, family: pinned.family }]);
    } else {
      const cb = callback as unknown as (
        err: Error | null,
        address: string,
        family: number
      ) => void;
      cb(null, pinned.address, pinned.family);
    }
  };

  const requestHeaders: Record<string, string> = { ...(options.headers || {}) };
  // Preserve original Host header semantics for the target hostname (including default port behavior handled by Node).
  // Do not override Host here; Node will set it correctly from the request URL/host.

  const reqOptions: http.RequestOptions & https.RequestOptions = {
    protocol: target.url.protocol,
    hostname: target.hostname, // original hostname kept for URL/Host
    port,
    method: options.method,
    path: `${target.url.pathname || "/"}${target.url.search || ""}`,
    headers: requestHeaders,
    lookup,
    timeout: options.timeoutMs,
    signal: AbortSignal.timeout(options.timeoutMs),
  };

  if (isHttps) {
    // Preserve TLS SNI and certificate verification against the original hostname.
    reqOptions.servername = target.hostname;
    reqOptions.rejectUnauthorized = true;
  }

  return await new Promise<PinnedRequestResult>((resolve, reject) => {
    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      if (err instanceof WebSecurityError) {
        reject(err);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (/timeout|timed out|ETIMEDOUT|aborted/i.test(msg)) {
        reject(toPublicError("TIMEOUT", "Délai dépassé lors de la récupération de la ressource.", 504));
      } else {
        reject(toPublicError("UNREACHABLE", "Site inaccessible ou ressource indisponible.", 502));
      }
    };
    const succeed = (result: PinnedRequestResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const transport = isHttps ? https : http;
    const req = transport.request(reqOptions, (res) => {
      const status = res.statusCode || 0;
      const isRedirect = [301, 302, 303, 307, 308].includes(status);
      if (isRedirect || options.method === "HEAD") {
        // No body needed for redirects/HEAD in this flow.
        res.resume();
        res.on("end", () => succeed({ status, headers: res.headers, body: Buffer.alloc(0) }));
        res.on("error", fail);
        return;
      }
      readNodeBodyWithLimit(res, options.maxBytes, res.headers["content-length"])
        .then((body) => succeed({ status, headers: res.headers, body }))
        .catch(fail);
    });

    req.on("timeout", () => {
      try { req.destroy(new Error("timeout")); } catch { /* ignore */ }
    });
    req.on("error", fail);
    req.on("close", () => {
      // close without response settlement handled by error/end paths where applicable
    });
    req.end();
  });
}

export async function safeFetchValidatedUrl(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const allowedContentTypes = options.allowedContentTypes ?? [];
  const method = options.method ?? "GET";

  let current = parseAndNormalizeHttpUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    // Resolve DNS before each connection and pin a pre-validated, globally routable address.
    const validatedAddresses = await resolveAndValidatePublicAddresses(current.hostname);
    const pinned = validatedAddresses[0];
    if (!pinned) {
      throw toPublicError(
        "FORBIDDEN_DESTINATION",
        "Destination non autorisée : le domaine ne pointe pas vers une adresse publique."
      );
    }

    const response = await requestWithPinnedDns(current, pinned, {
      method,
      timeoutMs,
      headers: options.headers,
      maxBytes,
    });

    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
    if (isRedirect) {
      if (redirectCount >= maxRedirects) {
        throw toPublicError("TOO_MANY_REDIRECTS", "Redirection interdite : nombre maximal de redirections dépassé.", 400);
      }
      const locationHeader = response.headers["location"];
      const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;
      if (!location || !String(location).trim()) {
        throw toPublicError("INVALID_REDIRECT", "Redirection invalide ou non exploitable.", 400);
      }
      let nextUrl: string;
      try {
        nextUrl = new URL(String(location), current.url).toString();
      } catch {
        throw toPublicError("INVALID_REDIRECT", "Redirection invalide ou non exploitable.", 400);
      }
      try {
        // Each redirect is analyzed/normalized and will be DNS-resolved + IP-classified on next loop iteration.
        current = parseAndNormalizeHttpUrl(nextUrl);
        // Pre-validate DNS/IP for the redirect target now to surface a specific forbidden-redirect error.
        await resolveAndValidatePublicAddresses(current.hostname);
      } catch (e) {
        if (e instanceof WebSecurityError) {
          if (
            e.code === "FORBIDDEN_DESTINATION" ||
            e.code === "UNSUPPORTED_PROTOCOL" ||
            e.code === "INVALID_URL" ||
            e.code === "DNS_RESOLUTION_FAILED"
          ) {
            throw toPublicError("FORBIDDEN_REDIRECT", "Redirection vers une destination non autorisée.", 400);
          }
          throw e;
        }
        throw toPublicError("FORBIDDEN_REDIRECT", "Redirection vers une destination non autorisée.", 400);
      }
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw toPublicError("UNREACHABLE", "Site inaccessible ou ressource indisponible.", 502);
    }

    const mime = getMimeType(response.headers["content-type"]);
    if (allowedContentTypes.length > 0 && !isAllowedContentType(mime, allowedContentTypes)) {
      throw toPublicError(
        "UNSUPPORTED_CONTENT_TYPE",
        "Type de contenu non pris en charge pour cette opération.",
        415
      );
    }

    return {
      url: current.url.toString(),
      status: response.status,
      headers: headersToFetchHeaders(response.headers),
      buffer: response.body,
      contentType: mime,
    };
  }

  throw toPublicError("TOO_MANY_REDIRECTS", "Redirection interdite : nombre maximal de redirections dépassé.", 400);
}

// ----- Social URL validation -----

export type SupportedSocialPlatform = "tiktok" | "instagram";

const TIKTOK_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);
const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
]);

function isAllowedSocialHost(platform: SupportedSocialPlatform, hostname: string): boolean {
  const h = normalizeHostname(hostname);
  if (platform === "tiktok") return TIKTOK_HOSTS.has(h);
  return INSTAGRAM_HOSTS.has(h);
}

export interface ValidatedSocialLink {
  platform: SupportedSocialPlatform;
  url: URL;
  normalizedUrl: string;
}

export function validateSupportedSocialLink(rawUrl: string): ValidatedSocialLink {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    throw toPublicError("INVALID_URL", "URL invalide. Vérifiez le format du lien.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw toPublicError("UNSUPPORTED_PROTOCOL", "Seuls les liens http ou https sont pris en charge.");
  }
  if (parsed.username || parsed.password) {
    throw toPublicError("INVALID_URL", "Les URL contenant des identifiants ne sont pas autorisées.");
  }

  const rawHost = parsed.hostname || "";
  if (hasAmbiguousIpEncoding(rawHost) || rawHost.includes("%")) {
    throw toPublicError("INVALID_URL", "URL invalide ou ambiguë.");
  }

  const hostname = normalizeHostname(rawHost);
  let platform: SupportedSocialPlatform | null = null;
  if (isAllowedSocialHost("tiktok", hostname)) platform = "tiktok";
  else if (isAllowedSocialHost("instagram", hostname)) platform = "instagram";

  if (!platform) {
    throw toPublicError(
      "UNSUPPORTED_PLATFORM",
      "Plateforme non prise en charge. Seuls les liens TikTok et Instagram sont acceptés."
    );
  }

  // Basic format sanity: require a meaningful path (avoid bare domains)
  const path = parsed.pathname || "/";
  if (platform === "tiktok") {
    const ok = /^\/.+/.test(path) && path !== "/";
    if (!ok) {
      throw toPublicError("INVALID_URL", "Format de lien TikTok non pris en charge.");
    }
  } else {
    const ok = /^\/.+/.test(path) && path !== "/";
    if (!ok) {
      throw toPublicError("INVALID_URL", "Format de lien Instagram non pris en charge.");
    }
  }

  // Normalize: keep origin + pathname + search (drop hash) to avoid leaking fragments and reduce ambiguity
  parsed.hash = "";
  return { platform, url: parsed, normalizedUrl: parsed.toString() };
}

export function toSafeClientErrorMessage(err: unknown): { status: number; error: string; code?: string } {
  if (err instanceof WebSecurityError) {
    return { status: err.status, error: err.publicMessage, code: err.code };
  }
  return { status: 500, error: "Une erreur est survenue lors du traitement de la requête." };
}
