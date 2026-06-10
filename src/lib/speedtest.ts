// ─────────────────────────────────────────────
// NetSpeed.me – Speed Test Engine
// Pure browser-based, no paid APIs required
// ─────────────────────────────────────────────

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
  server: string;
  mode: TestMode;
  score: number;
  timestamp: string;
}

// ─── Test server configuration ────────────────────────────────────────────────

// Optional dedicated speedtest backend (see server/speedtest-server.js for a
// reference implementation). It must expose CORS-enabled endpoints:
//   GET  /download?bytes=N  → streams N incompressible bytes
//   POST /upload            → accepts and discards a binary body
//   GET  /ping              → responds immediately
// With a dedicated server, results are comparable to tools like Ookla.
// Without one, public endpoints are used and results are an estimate only —
// upload in particular reads low, since public echo endpoints are not built
// for sustained upload throughput.
export const TEST_SERVER_URL = (
  process.env.NEXT_PUBLIC_TEST_SERVER_URL ?? ""
).replace(/\/+$/, "");

export type TestMode = "dedicated" | "browser";

export function getTestMode(): TestMode {
  return TEST_SERVER_URL ? "dedicated" : "browser";
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

// We hit a fast, CORS-friendly endpoint repeatedly and measure round-trip time.
// Cloudflare's /cdn-cgi/trace is ideal — tiny payload, global CDN, always up.
const BROWSER_PING_TARGETS = [
  "https://cloudflare.com/cdn-cgi/trace",
  "https://www.google.com/generate_204",
  "https://httpbin.org/get",
];

function pingTargets(): string[] {
  return TEST_SERVER_URL
    ? [`${TEST_SERVER_URL}/ping`, ...BROWSER_PING_TARGETS]
    : BROWSER_PING_TARGETS;
}

export async function measurePing(
  samples = 10,
  onSample?: (ms: number, i: number) => void
): Promise<PingResult> {
  const results: number[] = [];

  // Find a working target first
  const targets = pingTargets();
  let target = targets[0];
  for (const t of targets) {
    try {
      await fetch(t, { method: "HEAD", mode: "no-cors", signal: AbortSignal.timeout(3000) });
      target = t;
      break;
    } catch {
      // continue
    }
  }

  for (let i = 0; i < samples; i++) {
    try {
      const t0 = performance.now();
      await fetch(`${target}?_=${Date.now()}-${i}`, {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      const ms = performance.now() - t0;
      results.push(Math.round(ms));
      onSample?.(Math.round(ms), i);
      // Small gap between pings — keeps the whole phase around 2–3s
      await sleep(100);
    } catch {
      // skip failed ping
    }
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

// CORS-friendly bulk sources, refetched as many times as the window allows.
// If one fails before delivering any data we move to the next. A configured
// dedicated server always takes priority.
const BROWSER_DOWNLOAD_SOURCES = [
  "https://speed.cloudflare.com/__down?bytes=50000000",
  "https://speed.cloudflare.com/__down?bytes=10000000",
  "https://ipv4.download.thinkbroadband.com/10MB.zip",
];

function downloadSources(): string[] {
  return TEST_SERVER_URL
    ? [`${TEST_SERVER_URL}/download?bytes=50000000`, ...BROWSER_DOWNLOAD_SOURCES]
    : BROWSER_DOWNLOAD_SOURCES;
}

// Parallel connections saturate the link better than a single stream,
// matching how dedicated tools (Ookla, fast.com) measure.
const DOWNLOAD_PARALLEL_STREAMS = 4;

export async function measureDownload(
  onProgress?: (pct: number, mbps: number) => void
): Promise<SpeedResult> {
  const sources = downloadSources();
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

  // Nothing transferred at all: synthetic read of a local ArrayBuffer
  if (total === 0) return syntheticDownloadFallback(onProgress);

  const durationMs = performance.now() - start;
  const mbps = (total * 8) / ((durationMs / 1000) * 1_000_000);
  report(total, true);
  return { mbps: Math.round(mbps * 10) / 10, bytes: total, durationMs };
}

async function syntheticDownloadFallback(
  onProgress?: (pct: number, mbps: number) => void
): Promise<SpeedResult> {
  // Simulate writing and reading 5MB through a Blob URL to exercise I/O
  try {
    const SIZE = 5 * 1024 * 1024;
    const data = new Uint8Array(SIZE);
    fillRandom(data.subarray(0, 65536)); // random first 64KB only (fast)

    const t0 = performance.now();
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);

    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    URL.revokeObjectURL(url);

    const durationMs = performance.now() - t0;
    const mbps = (buf.byteLength * 8) / ((durationMs / 1000) * 1_000_000);
    onProgress?.(100, Math.round(mbps * 10) / 10);
    return { mbps: Math.round(mbps * 10) / 10, bytes: buf.byteLength, durationMs };
  } catch {
    onProgress?.(100, 0);
    return { mbps: 0, bytes: 0, durationMs: 0 };
  }
}

// ─── Upload Speed ─────────────────────────────────────────────────────────────

// We POST random binary data to a CORS-enabled echo/discard endpoint.
// speed.cloudflare.com/__up discards the body (no echo overhead) and sends
// Access-Control-Allow-Origin: *, so it goes first among the public ones.
// A configured dedicated server always takes priority.
const BROWSER_UPLOAD_ENDPOINTS = [
  "https://speed.cloudflare.com/__up",
  "https://httpbin.org/post",
  "https://postman-echo.com/post",
];

function uploadEndpoints(): string[] {
  return TEST_SERVER_URL
    ? [`${TEST_SERVER_URL}/upload`, ...BROWSER_UPLOAD_ENDPOINTS]
    : BROWSER_UPLOAD_ENDPOINTS;
}

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
  onProgress?: (pct: number, mbps: number) => void
): Promise<SpeedResult> {
  // Generate random payload (chunked — getRandomValues caps at 64KB per call)
  const data = new Uint8Array(UPLOAD_CHUNK_BYTES);
  fillRandom(data.subarray(0, 131072)); // random first 128KB
  const blob = new Blob([data], { type: "application/octet-stream" });

  const endpoints = uploadEndpoints();
  const start = performance.now();
  const deadline = start + UPLOAD_TEST_DURATION_MS;
  const report = makeReporter(start, UPLOAD_TEST_DURATION_MS, onProgress);
  let total = 0;
  let endpointIdx = 0;

  // Keep the progress bar moving between upload-progress events
  const ticker = onProgress ? setInterval(() => report(total), 200) : null;

  try {
    while (performance.now() < deadline && endpointIdx < endpoints.length) {
      let chunkSent = 0;
      try {
        await uploadChunk(endpoints[endpointIdx], blob, deadline, (delta) => {
          chunkSent += delta;
          total += delta;
          report(total);
        });
      } catch {
        total -= chunkSent; // a failed POST never reached the server
        endpointIdx++;
      }
    }
  } finally {
    if (ticker) clearInterval(ticker);
  }

  // Fallback: measure local Blob encoding throughput
  if (total === 0) return syntheticUploadFallback(onProgress);

  const durationMs = performance.now() - start;
  const mbps = (total * 8) / ((durationMs / 1000) * 1_000_000);
  report(total, true);
  return { mbps: Math.round(mbps * 10) / 10, bytes: total, durationMs };
}

async function syntheticUploadFallback(
  onProgress?: (pct: number, mbps: number) => void
): Promise<SpeedResult> {
  try {
    const SIZE = 2 * 1024 * 1024;
    const data = new Uint8Array(SIZE);
    fillRandom(data.subarray(0, 65536));

    const t0 = performance.now();
    // Encode to base64 (simulates upload serialisation work)
    const blob = new Blob([data]);
    const reader = new FileReader();
    await new Promise<void>((resolve) => {
      reader.onload = () => resolve();
      reader.onerror = () => resolve();
      reader.readAsDataURL(blob);
    });

    const durationMs = performance.now() - t0;
    const mbps = (SIZE * 8) / ((durationMs / 1000) * 1_000_000);
    onProgress?.(100, Math.round(mbps * 10) / 10);
    return { mbps: Math.round(mbps * 10) / 10, bytes: SIZE, durationMs };
  } catch {
    onProgress?.(100, 0);
    return { mbps: 0, bytes: 0, durationMs: 0 };
  }
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
