// ─────────────────────────────────────────────
// NetSpeed.me – Speed Test Engine
// Probes the server registry, picks the lowest-latency server, and runs
// all measurements against it.
// ─────────────────────────────────────────────

import { TEST_SERVERS, type TestServer } from "./servers";

export { TEST_SERVERS, serverHostname, type TestServer } from "./servers";

export interface NetworkInfo {
  ip: string;
  isp: string;
  country: string;
  city: string;
  region: string;
  lat: number;
  lon: number;
  org: string;
  timezone: string;
}

export interface PingResult {
  avg: number;      // ms
  min: number;
  max: number;
  jitter: number;   // ms standard deviation
  samples: number[];
}

export interface SpeedResult {
  mbps: number;
  bytes: number;
  durationMs: number;
}

export interface BrowserInfo {
  name: string;
  version: string;
  os: string;
  connection: string;
}

export interface TestResults {
  network: NetworkInfo | null;
  ping: PingResult | null;
  download: SpeedResult | null;
  upload: SpeedResult | null;
  packetLoss: string;
  browser: BrowserInfo;
  server: TestServer;
  serverLatencyMs: number;
  score: number;
  timestamp: string;
}

// ─── Server selection ─────────────────────────────────────────────────────────

export interface ServerSelection {
  server: TestServer;
  latencyMs: number; // best probe RTT, used only for picking a server
}

const PROBE_SAMPLES = 3;
const PROBE_TIMEOUT_MS = 3000;

// ─── Latency sampling ──────────────────────────────────────────────────────

// One latency sample against a server's /ping endpoint.
//
// Wall-clock fetch timing over-reports latency badly: hosting proxies add
// per-request processing that ICMP ping never sees (~200ms per request on
// Hostinger — 4x the real network RTT). When the server sends
// Timing-Allow-Origin, the Resource Timing API allows better measurements,
// in order of preference:
//   1. TCP handshake time — one pure network round trip, immune to proxy
//      and app processing. Available because /ping closes its connection,
//      so every sample opens a fresh one.
//   2. Request→first-byte time minus the app's Server-Timing duration —
//      excludes connection setup and app work, still includes the proxy.
//   3. Wall-clock fetch duration — the upper bound, used when the server
//      doesn't expose timing data.
// Resource Timing entries are recorded only after the response body
// finishes loading, which can be a tick after fetch() resolves — poll
// briefly instead of reading once.
async function resourceEntryFor(
  url: string
): Promise<PerformanceResourceTiming | undefined> {
  for (let i = 0; i < 6; i++) {
    const entry = performance
      .getEntriesByName(url)
      .pop() as PerformanceResourceTiming | undefined;
    if (entry) return entry;
    await sleep(16);
  }
  return undefined;
}

async function sampleLatency(
  serverUrl: string,
  tag: string,
  timeoutMs: number
): Promise<number> {
  const url = `${serverUrl}/ping?_=${tag}`;
  const t0 = performance.now();
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const wall = performance.now() - t0;
  try {
    await res.arrayBuffer(); // completes the load so a timing entry exists
  } catch {
    // entry may appear regardless
  }

  const entry = await resourceEntryFor(url);
  // requestStart stays 0 for cross-origin resources unless the server
  // sent Timing-Allow-Origin.
  if (!entry || entry.requestStart === 0) return wall;

  if (entry.connectEnd > entry.connectStart) {
    // Fresh connection. Over TCP+TLS the TCP handshake (connectStart →
    // secureConnectionStart) is exactly one network round trip. Over QUIC
    // (h3) transport and crypto are integrated and secureConnectionStart
    // ≈ connectStart, so the full handshake is the closest bound.
    const tcpRtt =
      entry.secureConnectionStart > 0
        ? entry.secureConnectionStart - entry.connectStart
        : 0;
    if (tcpRtt >= 1) return tcpRtt;
    const quicRtt = entry.connectEnd - entry.connectStart;
    if (quicRtt >= 1) return quicRtt;
  }

  // Reused connection: request sent → first response byte, minus the time
  // the app itself reports having spent on the request. Still includes
  // any per-request proxy processing.
  const appMs =
    entry.serverTiming?.find((t) => t.name === "app")?.duration ?? 0;
  const reqRtt = entry.responseStart - entry.requestStart - appMs;
  return reqRtt >= 1 ? reqRtt : wall;
}

// Frees Resource Timing buffer space (default cap ~250 entries) so latency
// samples reliably get an entry even after download phases.
function clearResourceTimings(): void {
  try {
    performance.clearResourceTimings();
  } catch {
    // optional optimisation only
  }
}

// ─── WebSocket latency sampling (preferred) ──────────────────────────────────

// HTTP requests through hosting proxies carry per-request processing that
// no Resource Timing trick can subtract once connections are multiplexed
// (h3) or keep-alive is proxy-managed. A WebSocket pays that cost once,
// at upgrade — echoed frames afterwards measure the actual network round
// trip, which is why dedicated tools report ICMP-class numbers.
interface PingSession {
  sample(timeoutMs?: number): Promise<number>;
  close(): void;
}

function openPingSession(
  serverUrl: string,
  timeoutMs = 4000
): Promise<PingSession> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${serverUrl.replace(/^http/, "ws")}/ws`);
    } catch (e) {
      return reject(e);
    }
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket open timed out"));
    }, timeoutMs);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve({
        sample(sampleTimeoutMs = 5000) {
          return new Promise<number>((res, rej) => {
            const payload = `${Date.now()}-${Math.random()}`;
            const sampleTimer = setTimeout(() => {
              cleanup();
              rej(new Error("Echo timed out"));
            }, sampleTimeoutMs);
            const onMessage = (ev: MessageEvent) => {
              if (ev.data !== payload) return; // stale echo from a skipped sample
              cleanup();
              res(performance.now() - t0);
            };
            const onClose = () => {
              cleanup();
              rej(new Error("WebSocket closed"));
            };
            const cleanup = () => {
              clearTimeout(sampleTimer);
              ws.removeEventListener("message", onMessage);
              ws.removeEventListener("close", onClose);
            };
            ws.addEventListener("message", onMessage);
            ws.addEventListener("close", onClose);
            const t0 = performance.now();
            ws.send(payload);
          });
        },
        close() {
          try {
            ws.close();
          } catch {
            // already closed
          }
        },
      });
    };
    ws.onerror = () => {
      clearTimeout(timer);
      ws.close();
      reject(new Error("WebSocket connection failed"));
    };
  });
}

// 10 echo round trips over one WebSocket; empty array if WS is unavailable
// (older backend deployment, proxy without upgrade support).
async function wsPingSamples(
  serverUrl: string,
  samples: number,
  onSample?: (ms: number, i: number) => void
): Promise<number[]> {
  const results: number[] = [];
  let session: PingSession;
  try {
    session = await openPingSession(serverUrl);
  } catch {
    return results;
  }
  try {
    // Warm-up echo, never counted: absorbs upgrade-adjacent jitter.
    try {
      await session.sample(3000);
    } catch {
      // timed samples below will surface a dead socket
    }
    for (let i = 0; i < samples; i++) {
      try {
        const ms = Math.round(await session.sample(5000));
        results.push(ms);
        onSample?.(ms, i);
        await sleep(100);
      } catch {
        // skip failed sample
      }
    }
  } finally {
    session.close();
  }
  return results;
}

// Best-of-N round trips to a server. Taking the minimum discounts
// transient congestion. WebSocket echo first (same transport the ping
// phase uses, so the displayed probe latency matches), HTTP /ping
// otherwise. Returns null if no sample succeeds.
async function probeServer(server: TestServer): Promise<number | null> {
  try {
    const session = await openPingSession(server.url, PROBE_TIMEOUT_MS);
    try {
      try {
        await session.sample(PROBE_TIMEOUT_MS); // warm-up, never counted
      } catch {
        // counted samples below decide
      }
      let best: number | null = null;
      for (let i = 0; i < PROBE_SAMPLES; i++) {
        try {
          const ms = await session.sample(PROBE_TIMEOUT_MS);
          if (best === null || ms < best) best = ms;
        } catch {
          // a failed sample just doesn't count
        }
      }
      if (best !== null) return Math.round(best);
    } finally {
      session.close();
    }
  } catch {
    // no WebSocket on this server — probe over HTTP below
  }

  let best: number | null = null;
  for (let i = 0; i < PROBE_SAMPLES; i++) {
    try {
      const ms = await sampleLatency(
        server.url,
        `probe-${Date.now()}-${i}`,
        PROBE_TIMEOUT_MS
      );
      if (best === null || ms < best) best = ms;
    } catch {
      // a failed sample just doesn't count
    }
  }
  return best === null ? null : Math.round(best);
}

// Probes every registered server in parallel and returns the fastest.
// Throws if none respond — there is no fallback mode.
export async function selectBestServer(
  onProbe?: (server: TestServer, latencyMs: number | null) => void
): Promise<ServerSelection> {
  clearResourceTimings();
  const probes = await Promise.all(
    TEST_SERVERS.map(async (server) => {
      const latencyMs = await probeServer(server);
      onProbe?.(server, latencyMs);
      return { server, latencyMs };
    })
  );

  const reachable = probes.filter(
    (p): p is ServerSelection => p.latencyMs !== null
  );
  if (reachable.length === 0) {
    throw new Error(
      "All test servers are unreachable. Check your internet connection and try again."
    );
  }
  return reachable.reduce((a, b) => (b.latencyMs < a.latencyMs ? b : a));
}

// ─── Network / IP Info ───────────────────────────────────────────────────────

// Ordered by CORS reliability. speed.cloudflare.com/meta sends
// Access-Control-Allow-Origin: * and is rarely rate-limited, so it goes first.
// ip-api.com is excluded: its HTTPS endpoint is paid-only and always 403s.
const IP_APIS = [
  "https://speed.cloudflare.com/meta",
  "https://ipwho.is/",
  "https://ipapi.co/json/",
];

// Last-resort: IP only, but CORS-enabled and extremely reliable.
const IP_ONLY_API = "https://api.ipify.org?format=json";

// Cloudflare's /meta returns ISO codes ("DZ") rather than country names.
function expandCountry(c: string): string {
  if (/^[A-Z]{2}$/.test(c)) {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(c) ?? c;
    } catch {
      return c;
    }
  }
  return c;
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

export async function fetchNetworkInfo(): Promise<NetworkInfo> {
  for (const url of IP_APIS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const d = await res.json();
      if (d.success === false) continue; // ipwho.is reports errors with 200 + success:false

      // Normalise across different API shapes
      const ip =
        d.ip ?? d.clientIp ?? d.query ?? d.IPv4 ?? "Unknown";
      const isp =
        d.isp ?? d.org ?? d.asOrganization ?? d.connection?.isp ?? d.as ?? "Unknown";
      const country = expandCountry(d.country_name ?? d.country ?? "Unknown");
      const city =
        d.city ?? "Unknown";
      const region =
        d.region ?? d.regionName ?? d.region_code ?? "";
      const lat = Number(d.latitude ?? d.lat ?? 0) || 0;
      const lon = Number(d.longitude ?? d.lon ?? 0) || 0;
      const org = d.org ?? d.asOrganization ?? d.isp ?? "";
      const timezone =
        (typeof d.timezone === "string" ? d.timezone : d.timezone?.id) ||
        browserTimezone();

      if (ip && ip !== "Unknown") {
        return { ip, isp, country, city, region, lat, lon, org, timezone };
      }
    } catch {
      // try next
    }
  }

  // All geo APIs failed — at least try to get the bare IP
  try {
    const res = await fetch(IP_ONLY_API, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const d = await res.json();
      if (d.ip) {
        return {
          ip: d.ip,
          isp: "Unavailable",
          country: "Unknown",
          city: "Unknown",
          region: "",
          lat: 0,
          lon: 0,
          org: "",
          timezone: browserTimezone(),
        };
      }
    }
  } catch {
    // fall through
  }

  return {
    ip: "Unavailable",
    isp: "Unavailable",
    country: "Unknown",
    city: "Unknown",
    region: "",
    lat: 0,
    lon: 0,
    org: "",
    timezone: browserTimezone(),
  };
}

// ─── Browser Info ─────────────────────────────────────────────────────────────

export function getBrowserInfo(): BrowserInfo {
  const ua = navigator.userAgent;

  let name = "Unknown";
  let version = "";

  if (ua.includes("Edg/")) {
    name = "Edge";
    version = ua.match(/Edg\/(\d+)/)?.[1] ?? "";
  } else if (ua.includes("OPR/") || ua.includes("Opera")) {
    name = "Opera";
    version = ua.match(/OPR\/(\d+)/)?.[1] ?? "";
  } else if (ua.includes("Firefox/")) {
    name = "Firefox";
    version = ua.match(/Firefox\/(\d+)/)?.[1] ?? "";
  } else if (ua.includes("Safari/") && !ua.includes("Chrome")) {
    name = "Safari";
    version = ua.match(/Version\/(\d+)/)?.[1] ?? "";
  } else if (ua.includes("Chrome/")) {
    name = "Chrome";
    version = ua.match(/Chrome\/(\d+)/)?.[1] ?? "";
  }

  let os = "Unknown";
  if (ua.includes("Windows NT")) os = "Windows";
  else if (ua.includes("Mac OS X")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  // @ts-expect-error – NetworkInformation API
  const conn = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection;
  const connection = conn
    ? `${conn.effectiveType?.toUpperCase() ?? ""}${conn.downlink ? ` · ${conn.downlink} Mbps` : ""}`
    : "Unknown";

  return { name, version, os, connection };
}

// ─── Ping & Jitter ────────────────────────────────────────────────────────────

// HTTP fallback: warm-up plus N corrected /ping round trips.
async function httpPingSamples(
  serverUrl: string,
  samples: number,
  onSample?: (ms: number, i: number) => void
): Promise<number[]> {
  const results: number[] = [];

  // Warm-up request, never counted: primes DNS and connection setup so
  // the first timed sample is not an outlier.
  try {
    await fetch(`${serverUrl}/ping?_=warmup-${Date.now()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // the timed samples below will surface a dead server
  }

  for (let i = 0; i < samples; i++) {
    try {
      const ms = Math.round(
        await sampleLatency(serverUrl, `${Date.now()}-${i}`, 5000)
      );
      results.push(ms);
      onSample?.(ms, i);
      // Small gap between pings — keeps the whole phase around 2–3s
      await sleep(100);
    } catch {
      // skip failed ping
    }
  }
  return results;
}

// Round-trip time against the selected server — the same server the
// throughput tests run on, so latency and speed describe the same path.
export async function measurePing(
  serverUrl: string,
  samples = 10,
  onSample?: (ms: number, i: number) => void
): Promise<PingResult> {
  clearResourceTimings();

  // Preferred: echo round trips over one WebSocket (true network RTT).
  let results = await wsPingSamples(serverUrl, samples, onSample);

  // Fallback: HTTP /ping with Resource Timing corrections.
  if (results.length === 0) {
    results = await httpPingSamples(serverUrl, samples, onSample);
  }

  if (results.length === 0) {
    return { avg: 0, min: 0, max: 0, jitter: 0, samples: [] };
  }

  const avg = Math.round(results.reduce((a, b) => a + b, 0) / results.length);
  const min = Math.min(...results);
  const max = Math.max(...results);

  // Jitter = mean absolute deviation between consecutive pings
  let jitterSum = 0;
  for (let i = 1; i < results.length; i++) {
    jitterSum += Math.abs(results[i] - results[i - 1]);
  }
  const jitter = results.length > 1 ? Math.round(jitterSum / (results.length - 1)) : 0;

  return { avg, min, max, jitter, samples: results };
}

// ─── Random payload helper ───────────────────────────────────────────────────

// crypto.getRandomValues throws if asked for more than 65536 bytes in one call,
// so fill in chunks; fall back to Math.random if crypto is unavailable.
function fillRandom(buf: Uint8Array): void {
  const CHUNK = 65536;
  try {
    for (let i = 0; i < buf.length; i += CHUNK) {
      crypto.getRandomValues(buf.subarray(i, Math.min(i + CHUNK, buf.length)));
    }
  } catch {
    for (let i = 0; i < buf.length; i++) {
      buf[i] = (Math.random() * 256) | 0;
    }
  }
}

// ─── Download Speed ──────────────────────────────────────────────────────────

// Both speed tests are time-based: keep transferring for a fixed window and
// compute Mbps from total bytes / total elapsed time, like Ookla/fast.com.
export const DOWNLOAD_TEST_DURATION_MS = 10_000;
export const UPLOAD_TEST_DURATION_MS = 10_000;

// Progress for time-based tests: % is elapsed time, Mbps is cumulative bytes.
function makeReporter(
  start: number,
  durationMs: number,
  onProgress?: (pct: number, mbps: number) => void
) {
  return (totalBytes: number, finished = false) => {
    const elapsed = performance.now() - start;
    const mbps =
      elapsed > 0 ? (totalBytes * 8) / ((elapsed / 1000) * 1_000_000) : 0;
    const pct = finished ? 100 : Math.min((elapsed / durationMs) * 100, 99);
    onProgress?.(pct, Math.round(mbps * 10) / 10);
  };
}

// The server streams incompressible bytes; each stream refetches the 100MB
// payload as many times as the 10-second window allows.

// Parallel connections saturate the link better than a single stream,
// matching how dedicated tools (Ookla, fast.com) measure.
const DOWNLOAD_PARALLEL_STREAMS = 4;

export async function measureDownload(
  serverUrl: string,
  onProgress?: (pct: number, mbps: number) => void
): Promise<SpeedResult> {
  const sources = [`${serverUrl}/download?size=100MB`];
  const start = performance.now();
  const deadline = start + DOWNLOAD_TEST_DURATION_MS;
  const report = makeReporter(start, DOWNLOAD_TEST_DURATION_MS, onProgress);
  let total = 0;

  // All streams share the deadline and byte counter; progress is reported on
  // a throttle ticker rather than per-chunk to keep React updates cheap.
  const ticker = onProgress ? setInterval(() => report(total), 150) : null;

  const stream = async () => {
    let srcIdx = 0;
    while (performance.now() < deadline && srcIdx < sources.length) {
      const controller = new AbortController();
      const killer = setTimeout(
        () => controller.abort(),
        Math.max(deadline - performance.now(), 0)
      );
      let gotBytes = false;

      try {
        const url = sources[srcIdx];
        const res = await fetch(
          `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}-${Math.random()}`,
          { cache: "no-store", signal: controller.signal }
        );
        if (!res.ok || !res.body) {
          srcIdx++;
          continue;
        }

        const reader = res.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value?.byteLength ?? 0;
          gotBytes = true;
        }
        // File finished early — the loop refetches until time is up.
      } catch {
        // The deadline abort lands here too; the while condition then exits.
        // A failure before any data arrived means a dead source — skip it.
        if (!gotBytes && performance.now() < deadline) srcIdx++;
      } finally {
        clearTimeout(killer);
      }
    }
  };

  try {
    await Promise.all(
      Array.from({ length: DOWNLOAD_PARALLEL_STREAMS }, () => stream())
    );
  } finally {
    if (ticker) clearInterval(ticker);
  }

  // Nothing transferred at all — the test server is unreachable.
  if (total === 0) {
    throw new Error("Could not reach the test server for the download test.");
  }

  const durationMs = performance.now() - start;
  const mbps = (total * 8) / ((durationMs / 1000) * 1_000_000);
  report(total, true);
  return { mbps: Math.round(mbps * 10) / 10, bytes: total, durationMs };
}

// ─── Upload Speed ─────────────────────────────────────────────────────────────

// We POST random binary data to the selected server's /upload endpoint,
// which accepts and discards the body (no echo overhead).

const UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024; // per-POST payload, re-sent until time is up

// One POST with a hard deadline, via XHR for real upload-progress events.
// Reports byte deltas as they leave the wire; a deadline abort resolves
// (the bytes count), a network/HTTP failure rejects.
function uploadChunk(
  endpoint: string,
  blob: Blob,
  deadline: number,
  onBytes: (delta: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - performance.now();
    if (remaining <= 0) return resolve();

    const xhr = new XMLHttpRequest();
    const killer = setTimeout(() => xhr.abort(), remaining);
    let sent = 0;

    xhr.upload.onprogress = (e) => {
      onBytes(e.loaded - sent);
      sent = e.loaded;
    };
    xhr.onload = () => {
      clearTimeout(killer);
      if (xhr.status >= 200 && xhr.status < 400) resolve();
      else reject(new Error(`HTTP ${xhr.status}`));
    };
    xhr.onerror = () => {
      clearTimeout(killer);
      reject(new Error("Network error"));
    };
    xhr.onabort = () => {
      clearTimeout(killer);
      resolve();
    };
    xhr.open("POST", endpoint);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.send(blob);
  });
}

export async function measureUpload(
  serverUrl: string,
  onProgress?: (pct: number, mbps: number) => void
): Promise<SpeedResult> {
  // Generate random payload (chunked — getRandomValues caps at 64KB per call)
  const data = new Uint8Array(UPLOAD_CHUNK_BYTES);
  fillRandom(data.subarray(0, 131072)); // random first 128KB
  const blob = new Blob([data], { type: "application/octet-stream" });

  const start = performance.now();
  const deadline = start + UPLOAD_TEST_DURATION_MS;
  const report = makeReporter(start, UPLOAD_TEST_DURATION_MS, onProgress);
  let total = 0;
  let failures = 0;

  // Keep the progress bar moving between upload-progress events
  const ticker = onProgress ? setInterval(() => report(total), 200) : null;

  try {
    while (performance.now() < deadline && failures < 3) {
      let chunkSent = 0;
      try {
        await uploadChunk(`${serverUrl}/upload`, blob, deadline, (delta) => {
          chunkSent += delta;
          total += delta;
          report(total);
        });
      } catch {
        total -= chunkSent; // a failed POST never reached the server
        failures++;
      }
    }
  } finally {
    if (ticker) clearInterval(ticker);
  }

  // Nothing transferred at all — the test server is unreachable.
  if (total === 0) {
    throw new Error("Could not reach the test server for the upload test.");
  }

  const durationMs = performance.now() - start;
  const mbps = (total * 8) / ((durationMs / 1000) * 1_000_000);
  report(total, true);
  return { mbps: Math.round(mbps * 10) / 10, bytes: total, durationMs };
}

// ─── Score ────────────────────────────────────────────────────────────────────

export function calculateScore(
  download: SpeedResult | null,
  upload: SpeedResult | null,
  ping: PingResult | null
): number {
  if (!download && !ping) return 0;

  const dl = download?.mbps ?? 0;
  const ul = upload?.mbps ?? 0;
  const p = ping?.avg ?? 999;
  const j = ping?.jitter ?? 999;

  // Weighted score out of 100
  const dlScore = Math.min(dl / 100, 1) * 40;       // 40pts – 100 Mbps = max
  const ulScore = Math.min(ul / 50, 1) * 25;        // 25pts – 50 Mbps = max
  const pingScore = Math.max(0, 1 - p / 200) * 25;  // 25pts – 0ms = max
  const jitterScore = Math.max(0, 1 - j / 50) * 10; // 10pts – 0ms = max

  return Math.round(dlScore + ulScore + pingScore + jitterScore);
}

export function scoreLabel(score: number): { label: string; color: string } {
  if (score >= 85) return { label: "Excellent", color: "#A3FF47" };
  if (score >= 65) return { label: "Good", color: "#00E5FF" };
  if (score >= 45) return { label: "Fair", color: "#F59E0B" };
  return { label: "Poor", color: "#EF4444" };
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function formatMbps(mbps: number): string {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  if (mbps < 1) return `${Math.round(mbps * 1000)} Kbps`;
  return `${mbps.toFixed(1)} Mbps`;
}
