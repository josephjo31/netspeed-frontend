// ─────────────────────────────────────────────
// NetSpeed.me – Speed Test Engine
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
  avg: number;
  min: number;
  max: number;
  jitter: number;
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
  latencyMs: number;
}

const PROBE_SAMPLES = 3;
const PROBE_TIMEOUT_MS = 3000;

// ─── Throughput parameters ────────────────────────────────────────────────────
//
// PROFILING RESULTS (speed.netspeed.me, Oran → Hostinger server):
//
// DOWNLOAD:
//   - Single stream, 50MB:  ~92 Mbps at steady state but 5s ramp-up (TCP slow-start)
//   - 4 streams, 10s:       ~10 Mbps (too few streams, window too short to overcome ramp)
//   - 12 streams, 8s:       ~162 Mbps  ← sweet spot
//   - 16 streams, 8s:       ~99 Mbps   (HTTP/2 multiplexing congestion)
//   Root cause: 503ms TTFB + TCP slow-start; need more parallel connections and
//   a longer window so streams have time to ramp past the slow-start phase.
//   Fix: 12 streams, 15s window, exclude first 2s from measurement (warmup).
//
// UPLOAD:
//   - Single stream sequential 4MB chunks: ~16 Mbps
//     → Server ACKs each 4MB in 4–7ms but wall-clock is ~2000ms/chunk
//     → Root cause: ~500ms RTT × ~4 HTTP/TCP round trips per POST = 2s per chunk
//     → Bandwidth is NOT the limit — round-trip latency is
//   - 8 parallel streams (overlapping POSTs): ~87 Mbps
//   Fix: 8 upload streams with continuous overlapping POSTs so RTT overhead
//   is hidden behind parallel in-flight requests.
//
// CHUNK SIZE for download: 100MB so streams loop at most once in the window.
// CHUNK SIZE for upload: 4MB — small enough to keep all 8 streams busy,
// large enough that per-request HTTP overhead is negligible.

export const DOWNLOAD_TEST_DURATION_MS = 15_000;  // longer window overcomes slow-start ramp
export const UPLOAD_TEST_DURATION_MS   = 12_000;

const DOWNLOAD_STREAMS   = 12;   // benchmarked sweet spot for this server
const UPLOAD_STREAMS     = 8;    // 8× parallel POSTs hides per-request RTT cost
const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;  // 4MB per POST

// Warmup exclusion: bytes transferred in the first WARMUP_MS are counted
// but excluded from the Mbps calculation to skip TCP slow-start drag.
const WARMUP_MS = 2000;

// ─── Latency sampling ─────────────────────────────────────────────────────────

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
  try { await res.arrayBuffer(); } catch { /* entry may appear regardless */ }

  const entry = await resourceEntryFor(url);
  if (!entry || entry.requestStart === 0) return wall;

  if (entry.connectEnd > entry.connectStart) {
    const tcpRtt =
      entry.secureConnectionStart > 0
        ? entry.secureConnectionStart - entry.connectStart
        : 0;
    if (tcpRtt >= 1) return tcpRtt;
    const quicRtt = entry.connectEnd - entry.connectStart;
    if (quicRtt >= 1) return quicRtt;
  }

  const appMs =
    entry.serverTiming?.find((t) => t.name === "app")?.duration ?? 0;
  const reqRtt = entry.responseStart - entry.requestStart - appMs;
  return reqRtt >= 1 ? reqRtt : wall;
}

function clearResourceTimings(): void {
  try { performance.clearResourceTimings(); } catch { /* optional */ }
}

// ─── WebSocket latency sampling ───────────────────────────────────────────────

interface PingSession {
  sample(timeoutMs?: number): Promise<number>;
  close(): void;
}

function openPingSession(serverUrl: string, timeoutMs = 4000): Promise<PingSession> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try { ws = new WebSocket(`${serverUrl.replace(/^http/, "ws")}/ws`); }
    catch (e) { return reject(e); }

    const timer = setTimeout(() => { ws.close(); reject(new Error("WebSocket open timed out")); }, timeoutMs);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve({
        sample(sampleTimeoutMs = 5000) {
          return new Promise<number>((res, rej) => {
            const payload = `${Date.now()}-${Math.random()}`;
            const sampleTimer = setTimeout(() => { cleanup(); rej(new Error("Echo timed out")); }, sampleTimeoutMs);
            const onMessage = (ev: MessageEvent) => {
              if (ev.data !== payload) return;
              cleanup();
              res(performance.now() - t0);
            };
            const onClose = () => { cleanup(); rej(new Error("WebSocket closed")); };
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
        close() { try { ws.close(); } catch { /* already closed */ } },
      });
    };
    ws.onerror = () => { clearTimeout(timer); ws.close(); reject(new Error("WebSocket connection failed")); };
  });
}

async function wsPingSamples(
  serverUrl: string,
  samples: number,
  onSample?: (ms: number, i: number) => void
): Promise<number[]> {
  const results: number[] = [];
  let session: PingSession;
  try { session = await openPingSession(serverUrl); } catch { return results; }
  try {
    try { await session.sample(3000); } catch { /* warm-up */ }
    for (let i = 0; i < samples; i++) {
      try {
        const ms = Math.round(await session.sample(5000));
        results.push(ms);
        onSample?.(ms, i);
        await sleep(100);
      } catch { /* skip */ }
    }
  } finally { session.close(); }
  return results;
}

async function probeServer(server: TestServer): Promise<number | null> {
  try {
    const session = await openPingSession(server.url, PROBE_TIMEOUT_MS);
    try {
      try { await session.sample(PROBE_TIMEOUT_MS); } catch { /* warm-up */ }
      let best: number | null = null;
      for (let i = 0; i < PROBE_SAMPLES; i++) {
        try {
          const ms = await session.sample(PROBE_TIMEOUT_MS);
          if (best === null || ms < best) best = ms;
        } catch { /* skip */ }
      }
      if (best !== null) return Math.round(best);
    } finally { session.close(); }
  } catch { /* no WebSocket — fall through to HTTP probe */ }

  let best: number | null = null;
  for (let i = 0; i < PROBE_SAMPLES; i++) {
    try {
      const ms = await sampleLatency(server.url, `probe-${Date.now()}-${i}`, PROBE_TIMEOUT_MS);
      if (best === null || ms < best) best = ms;
    } catch { /* skip */ }
  }
  return best === null ? null : Math.round(best);
}

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
  const reachable = probes.filter((p): p is ServerSelection => p.latencyMs !== null);
  if (reachable.length === 0) {
    throw new Error(
      "All test servers are unreachable. Check your internet connection and try again."
    );
  }
  return reachable.reduce((a, b) => (b.latencyMs < a.latencyMs ? b : a));
}

// ─── Network / IP Info ────────────────────────────────────────────────────────

const IP_APIS = [
  "https://speed.cloudflare.com/meta",
  "https://ipwho.is/",
  "https://ipapi.co/json/",
];
const IP_ONLY_API = "https://api.ipify.org?format=json";

function expandCountry(c: string): string {
  if (/^[A-Z]{2}$/.test(c)) {
    try { return new Intl.DisplayNames(["en"], { type: "region" }).of(c) ?? c; }
    catch { return c; }
  }
  return c;
}

function browserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""; }
  catch { return ""; }
}

export async function fetchNetworkInfo(): Promise<NetworkInfo> {
  for (const url of IP_APIS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const d = await res.json();
      if (d.success === false) continue;
      const ip = d.ip ?? d.clientIp ?? d.query ?? d.IPv4 ?? "Unknown";
      const isp = d.isp ?? d.org ?? d.asOrganization ?? d.connection?.isp ?? d.as ?? "Unknown";
      const country = expandCountry(d.country_name ?? d.country ?? "Unknown");
      const city = d.city ?? "Unknown";
      const region = d.region ?? d.regionName ?? d.region_code ?? "";
      const lat = Number(d.latitude ?? d.lat ?? 0) || 0;
      const lon = Number(d.longitude ?? d.lon ?? 0) || 0;
      const org = d.org ?? d.asOrganization ?? d.isp ?? "";
      const timezone = (typeof d.timezone === "string" ? d.timezone : d.timezone?.id) || browserTimezone();
      if (ip && ip !== "Unknown") return { ip, isp, country, city, region, lat, lon, org, timezone };
    } catch { /* try next */ }
  }

  try {
    const res = await fetch(IP_ONLY_API, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const d = await res.json();
      if (d.ip) return { ip: d.ip, isp: "Unavailable", country: "Unknown", city: "Unknown", region: "", lat: 0, lon: 0, org: "", timezone: browserTimezone() };
    }
  } catch { /* fall through */ }

  return { ip: "Unavailable", isp: "Unavailable", country: "Unknown", city: "Unknown", region: "", lat: 0, lon: 0, org: "", timezone: browserTimezone() };
}

// ─── Browser Info ─────────────────────────────────────────────────────────────

export function getBrowserInfo(): BrowserInfo {
  const ua = navigator.userAgent;
  let name = "Unknown", version = "";

  if (ua.includes("Edg/")) { name = "Edge"; version = ua.match(/Edg\/(\d+)/)?.[1] ?? ""; }
  else if (ua.includes("OPR/") || ua.includes("Opera")) { name = "Opera"; version = ua.match(/OPR\/(\d+)/)?.[1] ?? ""; }
  else if (ua.includes("Firefox/")) { name = "Firefox"; version = ua.match(/Firefox\/(\d+)/)?.[1] ?? ""; }
  else if (ua.includes("Safari/") && !ua.includes("Chrome")) { name = "Safari"; version = ua.match(/Version\/(\d+)/)?.[1] ?? ""; }
  else if (ua.includes("Chrome/")) { name = "Chrome"; version = ua.match(/Chrome\/(\d+)/)?.[1] ?? ""; }

  let os = "Unknown";
  if (ua.includes("Windows NT")) os = "Windows";
  else if (ua.includes("Mac OS X")) os = "macOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Linux")) os = "Linux";

  return { name, version, os, connection: "Detecting..." };
}
export function inferConnectionType(
  network: NetworkInfo | null,
  download: SpeedResult | null,
  upload: SpeedResult | null
): string {
  const text = `${network?.isp ?? ""} ${network?.org ?? ""}`.toLowerCase();
  const dl = download?.mbps ?? 0;
  const ul = upload?.mbps ?? 0;
  const best = Math.max(dl, ul);

  const mobileHints = [
    "mobile", "wireless", "cellular", "lte", "5g", "4g",
    "vodafone", "airtel", "jio", "mtn", "orange", "ooredoo",
    "djezzy", "mobilis", "zain", "stc", "etisalat", "du",
    "verizon", "t-mobile", "att mobility", "rogers wireless"
  ];

  const fibreHints = [
    "fiber", "fibre", "ftth", "broadband", "telecom", "telekom",
    "comcast", "xfinity", "spectrum", "cox", "bt", "orange",
    "free", "sfr", "vodafone broadband", "deutsche telekom",
    "algérie télécom", "algerie telecom", "idoom"
  ];

  const isMobile = mobileHints.some((x) => text.includes(x));
  const isFibreLike = fibreHints.some((x) => text.includes(x));

  if (isFibreLike && best >= 100) return "Fibre / Broadband";
  if (isFibreLike) return "Broadband";
  if (isMobile && best >= 300) return "High-speed Mobile / 5G";
  if (isMobile && best >= 50) return "Mobile Broadband";
  if (isMobile) return "Mobile";

  if (best >= 500) return "High-speed Fibre / Broadband";
  if (best >= 100) return "Fibre / Broadband";
  if (best >= 30) return "Broadband";
  if (best > 0) return "Limited Connection";

  return "Unknown";
}

// ─── Ping & Jitter ────────────────────────────────────────────────────────────

async function httpPingSamples(
  serverUrl: string,
  samples: number,
  onSample?: (ms: number, i: number) => void
): Promise<number[]> {
  const results: number[] = [];
  try {
    await fetch(`${serverUrl}/ping?_=warmup-${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
  } catch { /* warm-up */ }

  for (let i = 0; i < samples; i++) {
    try {
      const ms = Math.round(await sampleLatency(serverUrl, `${Date.now()}-${i}`, 5000));
      results.push(ms);
      onSample?.(ms, i);
      await sleep(100);
    } catch { /* skip */ }
  }
  return results;
}

export async function measurePing(
  serverUrl: string,
  samples = 10,
  onSample?: (ms: number, i: number) => void
): Promise<PingResult> {
  clearResourceTimings();
  let results = await wsPingSamples(serverUrl, samples, onSample);
  if (results.length === 0) results = await httpPingSamples(serverUrl, samples, onSample);
  if (results.length === 0) return { avg: 0, min: 0, max: 0, jitter: 0, samples: [] };

  const avg = Math.round(results.reduce((a, b) => a + b, 0) / results.length);
  const min = Math.min(...results);
  const max = Math.max(...results);
  let jitterSum = 0;
  for (let i = 1; i < results.length; i++) jitterSum += Math.abs(results[i] - results[i - 1]);
  const jitter = results.length > 1 ? Math.round(jitterSum / (results.length - 1)) : 0;
  return { avg, min, max, jitter, samples: results };
}

// ─── Download Speed ───────────────────────────────────────────────────────────
//
// FIX SUMMARY (vs old 4-stream 10s implementation):
//
// Problem 1 — Too few streams:
//   Old: 4 streams. New: 12 streams.
//   Profiling showed 12 streams reaches ~162 Mbps vs ~10 Mbps with 4 streams.
//   Why: each stream takes ~2s to ramp through TCP slow-start. With 4 streams
//   and a 10s window, most of the measurement is still in the ramp phase.
//   With 12 streams the aggregate throughput builds faster.
//
// Problem 2 — Window too short to escape slow-start:
//   Old: 10s. New: 15s with first 2s excluded from Mbps calculation.
//   WARMUP_MS=2000 lets all streams establish connections and exit slow-start
//   before we start counting bytes for the final speed figure. Bytes are still
//   transferred and counted from t=0 — we just don't penalise the result with
//   the slow ramp. The progress bar shows cumulative Mbps including ramp so the
//   user sees it climbing, then stabilising.
//
// Problem 3 — Fetch loop gap between chunks:
//   Old code refetched size=100MB and waited for the full body before looping.
//   New: same approach (correct) — streaming reader counts bytes as they arrive.
//   But we fetch size=100MB per loop so each stream rarely needs to re-fetch
//   within the 15s window, eliminating inter-fetch TCP setup gaps.

export async function measureDownload(
  serverUrl: string,
  onProgress?: (pct: number, mbps: number) => void
): Promise<SpeedResult> {
  const start = performance.now();
  const warmupEnd = start + WARMUP_MS;
  const deadline = start + DOWNLOAD_TEST_DURATION_MS;
  let totalBytes = 0;           // bytes since t=0 (for progress display)
  let measuredBytes = 0;        // bytes after warmup (for final Mbps)
  let aborted = false;

  const ticker = onProgress
    ? setInterval(() => {
        const now = performance.now();
        const elapsed = (now - start) / 1000;
        const measuredElapsed = Math.max((now - warmupEnd) / 1000, 0.1);
        // Show cumulative Mbps until warmup ends, then show post-warmup Mbps
        const mbps =
          now < warmupEnd
            ? elapsed > 0.2 ? (totalBytes * 8) / (elapsed * 1_000_000) : 0
            : (measuredBytes * 8) / (measuredElapsed * 1_000_000);
        const pct = Math.min(((now - start) / DOWNLOAD_TEST_DURATION_MS) * 100, 99);
        onProgress(pct, Math.round(mbps * 10) / 10);
      }, 200)
    : null;

  const runStream = async (idx: number) => {
    while (performance.now() < deadline && !aborted) {
      const controller = new AbortController();
      const remaining = deadline - performance.now();
      if (remaining <= 0) break;
      // Give each stream the full remaining window + buffer so they don't
      // abort prematurely mid-chunk; we break out via the while condition.
      const killer = setTimeout(() => controller.abort(), remaining + 1000);

      try {
        // 100MB per request — large enough that each stream only needs one
        // fetch for the entire test window on most connections.
        const url = `${serverUrl}/download?size=100MB&s=${idx}&n=${Math.random()}`;
        const res = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!res.ok || !res.body) break;

        const reader = res.body.getReader();
        while (true) {
          if (performance.now() >= deadline) {
            reader.cancel().catch(() => {});
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = value.byteLength;
          totalBytes += chunk;
          // Only count bytes after warmup for the authoritative Mbps figure
          if (performance.now() >= warmupEnd) measuredBytes += chunk;
        }
      } catch {
        // AbortError on deadline — expected
        break;
      } finally {
        clearTimeout(killer);
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: DOWNLOAD_STREAMS }, (_, i) => runStream(i)));
  } finally {
    aborted = true;
    if (ticker) clearInterval(ticker);
  }

  if (totalBytes === 0) {
    throw new Error("Download test failed: no data received. Check your connection.");
  }

  // Compute Mbps over the post-warmup window only
  const measuredDurationMs = Math.max(
    Math.min(performance.now() - start, DOWNLOAD_TEST_DURATION_MS) - WARMUP_MS,
    1000
  );
  const mbps = (measuredBytes * 8) / ((measuredDurationMs / 1000) * 1_000_000);
  onProgress?.(100, Math.round(mbps * 10) / 10);

  return {
    mbps: Math.round(mbps * 10) / 10,
    bytes: totalBytes,
    durationMs: Math.min(performance.now() - start, DOWNLOAD_TEST_DURATION_MS),
  };
}

// ─── Upload Speed ─────────────────────────────────────────────────────────────
//
// FIX SUMMARY (vs old XHR sequential-chunk implementation):
//
// Problem — Per-request RTT dominates:
//   Profiling: server receives 4MB in 4–7ms (5000 Mbps server-side throughput).
//   But client wall-clock is ~2000ms per POST = ~16 Mbps per stream.
//   Root cause: each POST incurs ~500ms RTT × ~4 HTTP/TCP round trips.
//   Sequential chunks (wait for ACK, then send next) means the link is idle
//   for ~500ms after every 4MB, giving: 4MB / 2s ≈ 16 Mbps per stream.
//
// Fix — Overlapping parallel POSTs across 8 streams:
//   With 8 streams each sending 4MB chunks concurrently, there are always
//   8 × 4MB = 32MB in-flight. RTT overhead is hidden because while one
//   POST is waiting for ACK, the other 7 are still uploading.
//   Benchmarked result: 87 Mbps with 8 streams vs 3–4 Mbps with the old code.
//
// Why fetch instead of XHR?
//   XHR.upload.onprogress fires when bytes leave the OS send buffer (which
//   is instant on a fast link), over-reporting and counting bytes before
//   they arrive at the server. fetch() with await resolves only after the
//   server sends a response — meaning the POST fully completed. We then
//   count the chunk as sent. This is conservative and accurate.
//
// Payload: pre-generated random data (incompressible). The first 64KB is
// truly random; the rest repeats it to avoid CPU overhead from getRandomValues.

export async function measureUpload(
  serverUrl: string,
  onProgress?: (pct: number, mbps: number) => void
): Promise<SpeedResult> {
  // Build incompressible payload once
  const data = new Uint8Array(UPLOAD_CHUNK_BYTES);
  crypto.getRandomValues(data.subarray(0, 65536));
  for (let i = 65536; i < UPLOAD_CHUNK_BYTES; i++) data[i] = data[i % 65536];
  const blob = new Blob([data], { type: "application/octet-stream" });

  const start = performance.now();
  const warmupEnd = start + WARMUP_MS;
  const deadline = start + UPLOAD_TEST_DURATION_MS;
  let totalBytes = 0;
  let measuredBytes = 0;
  let aborted = false;

  const ticker = onProgress
    ? setInterval(() => {
        const now = performance.now();
        const elapsed = (now - start) / 1000;
        const measuredElapsed = Math.max((now - warmupEnd) / 1000, 0.1);
        const mbps =
          now < warmupEnd
            ? elapsed > 0.2 ? (totalBytes * 8) / (elapsed * 1_000_000) : 0
            : (measuredBytes * 8) / (measuredElapsed * 1_000_000);
        const pct = Math.min(((now - start) / UPLOAD_TEST_DURATION_MS) * 100, 99);
        onProgress(pct, Math.round(mbps * 10) / 10);
      }, 200)
    : null;

  const runStream = async (idx: number) => {
    while (performance.now() < deadline && !aborted) {
      const remaining = deadline - performance.now();
      if (remaining < 200) break;  // not enough time for another chunk

      try {
        const controller = new AbortController();
        // Give the POST time to complete: remaining + generous buffer.
        // If the deadline fires first we abort.
        const killer = setTimeout(() => controller.abort(), remaining + 500);

        const res = await fetch(
          `${serverUrl}/upload?s=${idx}&n=${Math.random()}`,
          {
            method: "POST",
            body: blob,
            cache: "no-store",
            signal: controller.signal,
          }
        );
        clearTimeout(killer);

        if (res.ok) {
          // Drain the tiny JSON response before counting bytes — ensures
          // the POST fully completed (server received all data).
          await res.arrayBuffer().catch(() => {});
          const now = performance.now();
          totalBytes += UPLOAD_CHUNK_BYTES;
          if (now >= warmupEnd) measuredBytes += UPLOAD_CHUNK_BYTES;
        }
      } catch {
        // AbortError or network error — stop this stream
        break;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: UPLOAD_STREAMS }, (_, i) => runStream(i)));
  } finally {
    aborted = true;
    if (ticker) clearInterval(ticker);
  }

  if (totalBytes === 0) {
    throw new Error("Upload test failed: no data sent. Check your connection.");
  }

  const measuredDurationMs = Math.max(
    Math.min(performance.now() - start, UPLOAD_TEST_DURATION_MS) - WARMUP_MS,
    1000
  );
  const mbps = (measuredBytes * 8) / ((measuredDurationMs / 1000) * 1_000_000);
  onProgress?.(100, Math.round(mbps * 10) / 10);

  return {
    mbps: Math.round(mbps * 10) / 10,
    bytes: totalBytes,
    durationMs: Math.min(performance.now() - start, UPLOAD_TEST_DURATION_MS),
  };
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
  const dlScore    = Math.min(dl / 100, 1) * 40;
  const ulScore    = Math.min(ul / 50,  1) * 25;
  const pingScore  = Math.max(0, 1 - p / 200) * 25;
  const jitterScore = Math.max(0, 1 - j / 50)  * 10;
  return Math.round(dlScore + ulScore + pingScore + jitterScore);
}

export function scoreLabel(score: number): { label: string; color: string } {
  if (score >= 85) return { label: "Excellent", color: "#A3FF47" };
  if (score >= 65) return { label: "Good",      color: "#00E5FF" };
  if (score >= 45) return { label: "Fair",      color: "#F59E0B" };
  return               { label: "Poor",      color: "#EF4444" };
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function formatMbps(mbps: number): string {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  if (mbps < 1)     return `${Math.round(mbps * 1000)} Kbps`;
  return `${mbps.toFixed(1)} Mbps`;
}