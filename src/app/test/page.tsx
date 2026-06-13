"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import UnifiedGauge from "@/components/UnifiedGauge";
import PingChart from "@/components/PingChart";
import {
  fetchNetworkInfo,
  getBrowserInfo,
  selectBestServer,
  serverHostname,
  measurePing,
  measureDownload,
  measureUpload,
  calculateScore,
  scoreLabel,
  formatMbps,
  type ServerSelection,
  type TestResults,
  type NetworkInfo,
  type PingResult,
  type SpeedResult,
} from "@/lib/speedtest";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | "idle" | "detecting" | "selecting" | "ping"
  | "download" | "upload" | "scoring" | "done" | "error";

interface LiveState {
  pingMs: number;
  pingSamples: number[];
  downloadMbps: number;
  downloadPct: number;
  uploadMbps: number;
  uploadPct: number;
}

// ─── Root page ────────────────────────────────────────────────────────────────

export default function TestPage() {
  const [phase, setPhase]         = useState<Phase>("idle");
  const [error, setError]         = useState<string | null>(null);
  const [results, setResults]     = useState<TestResults | null>(null);
  const [selection, setSelection] = useState<ServerSelection | null>(null);
  const [live, setLive]           = useState<LiveState>({
    pingMs: 0, pingSamples: [],
    downloadMbps: 0, downloadPct: 0,
    uploadMbps: 0, uploadPct: 0,
  });
  const abortRef = useRef(false);

  const resetLive = () => setLive({
    pingMs: 0, pingSamples: [],
    downloadMbps: 0, downloadPct: 0,
    uploadMbps: 0, uploadPct: 0,
  });

  // ── All measurement logic UNCHANGED ──────────────────────────────────────
  const runTest = useCallback(async () => {
    abortRef.current = false;
    setError(null); setResults(null); setSelection(null); resetLive();
    try {
      setPhase("detecting");
      let network: NetworkInfo | null = null;
      const browser = getBrowserInfo();
      try { network = await fetchNetworkInfo(); } catch (e) { console.warn("Network detection failed:", e); }
      if (abortRef.current) return;

      setPhase("selecting");
      const selected = await selectBestServer();
      setSelection(selected);
      const serverUrl = selected.server.url;
      if (abortRef.current) return;

      setPhase("ping");
      let pingResult: PingResult | null = null;
      try {
        pingResult = await measurePing(serverUrl, 10, (ms) => {
          if (abortRef.current) return;
          setLive((prev) => ({ ...prev, pingMs: ms, pingSamples: [...prev.pingSamples, ms] }));
        });
      } catch (e) { console.warn("Ping test failed:", e); }
      if (abortRef.current) return;

      setPhase("download");
      let downloadResult: SpeedResult | null = null;
      try {
        downloadResult = await measureDownload(serverUrl, (pct, mbps) => {
          if (abortRef.current) return;
          setLive((prev) => ({ ...prev, downloadMbps: mbps, downloadPct: pct }));
        });
      } catch (e) { console.warn("Download test failed:", e); }
      if (abortRef.current) return;

      setPhase("upload");
      let uploadResult: SpeedResult | null = null;
      try {
        uploadResult = await measureUpload(serverUrl, (pct, mbps) => {
          if (abortRef.current) return;
          setLive((prev) => ({ ...prev, uploadMbps: mbps, uploadPct: pct }));
        });
      } catch (e) { console.warn("Upload test failed:", e); }
      if (abortRef.current) return;

      setPhase("scoring");
      await new Promise((r) => setTimeout(r, 600));
      const score = calculateScore(downloadResult, uploadResult, pingResult);
      setResults({
        network, ping: pingResult, download: downloadResult, upload: uploadResult,
        packetLoss: "unavailable", browser, server: selected.server,
        serverLatencyMs: selected.latencyMs, score,
        timestamp: new Date().toLocaleString(),
      });
      setPhase("done");
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      setPhase("error");
    }
  }, []);

  const handleReset = () => {
    abortRef.current = true;
    setPhase("idle"); setResults(null); setError(null);
    setSelection(null); resetLive();
  };

  const isActive = phase !== "idle" && phase !== "done" && phase !== "error";

  return (
    <div className="min-h-screen bg-[#090B10] flex flex-col">
      <Navbar />
      <main className="flex-1 pt-20 pb-16 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto">

          {/* Breadcrumb */}
          <div className="mb-8 flex items-center gap-3">
            <Link href="/" className="text-[#2D3748] hover:text-[#4A5568] transition-colors text-xs tracking-wide">
              ← Home
            </Link>
            <span className="text-[#1C2030] text-xs">/</span>
            <span className="font-display text-[10px] tracking-[0.25em] text-[#00E5FF] uppercase">Speed Test</span>
          </div>

          {phase === "idle"  && <IdleScreen onStart={runTest} />}
          {isActive          && <ActiveTest phase={phase} live={live} selection={selection} />}
          {phase === "done"  && results && <ResultsScreen results={results} onReset={handleReset} />}
          {phase === "error" && <ErrorScreen message={error} onRetry={runTest} />}
        </div>
      </main>
      <Footer />
    </div>
  );
}

// ─── Idle Screen ──────────────────────────────────────────────────────────────

function IdleScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center py-12 gap-10">
      {/* Start button */}
      <div className="relative" onClick={onStart}>
        {/* Outer pulse rings */}
        <div className="absolute inset-0 rounded-full border border-[#00E5FF]/8 scale-[1.35] animate-[ping_3s_ease-in-out_infinite]" />
        <div className="absolute inset-0 rounded-full border border-[#00E5FF]/5 scale-[1.6]" />
        <button
          className="relative w-44 h-44 rounded-full flex flex-col items-center justify-center gap-1.5
            border border-[#00E5FF]/25 bg-[#00E5FF]/4 hover:bg-[#00E5FF]/8 hover:border-[#00E5FF]/40
            transition-all duration-300 cursor-pointer group"
          style={{ boxShadow: "0 0 60px rgba(0,229,255,0.08), inset 0 0 40px rgba(0,229,255,0.03)" }}
          aria-label="Start speed test"
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-9 h-9 text-[#00E5FF] group-hover:scale-110 transition-transform duration-200">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-display text-[#00E5FF] text-base tracking-[0.3em] mt-0.5">START</span>
        </button>
      </div>

      <div className="text-center">
        <h1 className="text-xl font-medium text-white mb-2 tracking-wide">Network Speed Test</h1>
        <p className="text-[#4A5568] text-sm max-w-xs leading-relaxed">
          Measures download, upload, ping & jitter. Takes about 30 seconds.
        </p>
      </div>

      {/* What it tests */}
      <div className="flex gap-3 flex-wrap justify-center">
        {[
          { label: "Download", color: "#00E5FF" },
          { label: "Upload",   color: "#F59E0B" },
          { label: "Ping",     color: "#A3FF47" },
          { label: "Jitter",   color: "#C084FC" },
        ].map(({ label, color }) => (
          <span key={label} className="px-3 py-1 rounded-full text-[11px] tracking-widest uppercase border"
            style={{ color, borderColor: `${color}22`, background: `${color}08` }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Active Test ──────────────────────────────────────────────────────────────

const PHASE_META: Record<string, { label: string; gaugePhase: "download"|"upload"|"idle" }> = {
  detecting: { label: "Detecting network",    gaugePhase: "idle"     },
  selecting: { label: "Selecting server",     gaugePhase: "idle"     },
  ping:      { label: "Measuring ping",       gaugePhase: "idle"     },
  download:  { label: "Download",             gaugePhase: "download" },
  upload:    { label: "Upload",               gaugePhase: "upload"   },
  scoring:   { label: "Finishing up",         gaugePhase: "idle"     },
};

const PHASE_COLOR: Record<string, string> = {
  download: "#00E5FF",
  upload:   "#F59E0B",
  ping:     "#A3FF47",
  idle:     "#4A5568",
};

const STATUS_TEXT: Record<string, string> = {
  detecting: "Detecting network...",
  selecting: "Selecting server...",
  ping:      "Measuring latency...",
  download:  "Testing Download...",
  upload:    "Testing Upload...",
  scoring:   "Calculating score...",
};

function fmtSpeed(mbps: number): string {
  if (mbps <= 0) return "—";
  if (mbps >= 1000) return (mbps / 1000).toFixed(2);
  if (mbps >= 100)  return mbps.toFixed(0);
  return mbps.toFixed(1);
}

function LiveStatMini({
  label, value, unit, color, active,
}: {
  label: string; value: string; unit: string; color: string; active: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
      <div className="flex items-center gap-1 mb-0.5">
        {active && (
          <span className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
            style={{ background: color }} />
        )}
        <span className="text-[9px] tracking-[0.18em] uppercase truncate"
          style={{ color: active ? color : "#4A5568" }}>
          {label}
        </span>
      </div>
      <div
        className="font-display tabular-nums leading-none"
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: value !== "—" ? color : "#2D3748",
          textShadow: active && value !== "—" ? `0 0 14px ${color}55` : "none",
        }}
      >
        {value}
      </div>
      <div className="text-[9px] text-[#2D3748] uppercase tracking-wider mt-0.5">{unit}</div>
    </div>
  );
}

function ActiveTest({
  phase,
  live,
  selection,
}: {
  phase: Phase;
  live: LiveState;
  selection: ServerSelection | null;
}) {
  const meta      = PHASE_META[phase] ?? { label: "Running", gaugePhase: "idle" as const };
  const isDownload = phase === "download";
  const isUpload   = phase === "upload";

  const gaugeValue = isUpload   ? live.uploadMbps
                   : isDownload ? live.downloadMbps
                   : 0;
  const gaugeMax   = isUpload ? 300 : 600;
  const gaugePct   = isUpload ? live.uploadPct : live.downloadPct;

  const accentColor = isDownload ? "#00E5FF" : isUpload ? "#F59E0B" : "#4A5568";

  // Live jitter from ping samples
  const jitterMs = live.pingSamples.length > 1
    ? Math.round(
        live.pingSamples.slice(1).reduce((sum, ms, i) =>
          sum + Math.abs(ms - live.pingSamples[i]), 0) /
        (live.pingSamples.length - 1)
      )
    : null;

  // Download unit (switches to Gbps at ≥1000)
  const dlUnit  = live.downloadMbps >= 1000 ? "Gbps" : "Mbps";
  const ulUnit  = live.uploadMbps  >= 1000 ? "Gbps" : "Mbps";

  // Elapsed time counter
  const startRef  = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Step pills
  const steps: { id: string; label: string }[] = [
    { id: "ping",     label: "Ping"     },
    { id: "download", label: "Download" },
    { id: "upload",   label: "Upload"   },
  ];
  const orderedPhases = ["detecting","selecting","ping","download","upload","scoring"];
  const phaseIdx  = orderedPhases.indexOf(phase);
  const isDone    = (id: string) => orderedPhases.indexOf(id) < phaseIdx;
  const isCurrent = (id: string) =>
    id === phase || (id === "ping" && (phase === "detecting" || phase === "selecting"));

  // Phase label icon
  const phaseIcon = isDownload ? "↓" : isUpload ? "↑" : null;

  return (
    <div className="flex flex-col items-center gap-5">

      {/* Phase label with icon */}
      <div className="min-h-[28px] flex items-center justify-center gap-2">
        {phaseIcon && (
          <span className="font-display text-xs transition-colors duration-500"
            style={{ color: accentColor }}>
            {phaseIcon}
          </span>
        )}
        <span
          className="font-display text-xs tracking-[0.35em] uppercase transition-colors duration-500"
          style={{ color: accentColor }}
        >
          {meta.label}
        </span>
      </div>

      {/* Speedometer gauge */}
      <div className="flex items-center justify-center">
        <UnifiedGauge
          value={gaugeValue}
          max={gaugeMax}
          phase={meta.gaugePhase}
          progress={gaugePct}
          size={320}
        />
      </div>

      {/* "Testing…" status with spinner */}
      <div className="flex items-center gap-2">
        <svg className="animate-spin w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none"
          style={{ color: accentColor }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
          <path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span className="text-[11px] tracking-wide transition-colors duration-300"
          style={{ color: `${accentColor}99` }}>
          {STATUS_TEXT[phase] ?? "Running..."}
        </span>
      </div>

      {/* Live stats strip */}
      <div className="flex items-start w-full gap-1 px-2">
        <LiveStatMini
          label="Ping"
          value={live.pingMs > 0 ? String(live.pingMs) : "—"}
          unit="ms"
          color="#A3FF47"
          active={phase === "ping" || phase === "detecting" || phase === "selecting"}
        />
        <div className="w-px self-stretch bg-[#1C2030] flex-shrink-0" />
        <LiveStatMini
          label="Download"
          value={fmtSpeed(live.downloadMbps)}
          unit={live.downloadMbps > 0 ? dlUnit : "Mbps"}
          color="#00E5FF"
          active={isDownload}
        />
        <div className="w-px self-stretch bg-[#1C2030] flex-shrink-0" />
        <LiveStatMini
          label="Upload"
          value={fmtSpeed(live.uploadMbps)}
          unit={live.uploadMbps > 0 ? ulUnit : "Mbps"}
          color="#F59E0B"
          active={isUpload}
        />
        <div className="w-px self-stretch bg-[#1C2030] flex-shrink-0" />
        <LiveStatMini
          label="Jitter"
          value={jitterMs !== null ? String(jitterMs) : "—"}
          unit="ms"
          color="#C084FC"
          active={false}
        />
      </div>

      {/* Step pills */}
      <div className="flex items-center gap-3">
        {steps.map(({ id, label }) => (
          <div key={id} className="flex items-center gap-2">
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] tracking-widest uppercase border transition-all duration-300"
              style={{
                borderColor: isDone(id)
                  ? `${PHASE_COLOR[id] ?? "#4A5568"}33`
                  : isCurrent(id)
                  ? `${PHASE_COLOR[id] ?? "#4A5568"}55`
                  : "#1C2030",
                color: isDone(id) || isCurrent(id)
                  ? PHASE_COLOR[id] ?? "#4A5568"
                  : "#2D3748",
                background: isCurrent(id)
                  ? `${PHASE_COLOR[id] ?? "#4A5568"}10`
                  : "transparent",
              }}
            >
              {isDone(id) && (
                <svg viewBox="0 0 10 10" className="w-2 h-2 flex-shrink-0">
                  <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="currentColor" strokeWidth="1.5"
                    fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {isCurrent(id) && (
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse flex-shrink-0" />
              )}
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Server + elapsed row */}
      <div className="flex items-center gap-4 text-[11px] text-[#2D3748]">
        {selection && (
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-[#00E5FF] opacity-60" />
            {selection.server.name}
            <span className="text-[#1C2030]">·</span>
            {serverHostname(selection.server)}
          </span>
        )}
        <span className="tabular-nums">{elapsed}s</span>
      </div>
    </div>
  );
}

// ─── Results Screen ───────────────────────────────────────────────────────────

function ResultsScreen({
  results,
  onReset,
}: {
  results: TestResults;
  onReset: () => void;
}) {
  const { ping, download, upload, network, browser, score, timestamp, server } = results;
  const { label: scoreText, color: scoreColor } = scoreLabel(score);

  return (
    <div className="flex flex-col gap-6">

      {/* ── Primary 4-stat strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Download"
          value={download ? formatMbps(download.mbps) : "—"}
          sub={download ? `${(download.bytes / 1e6).toFixed(0)} MB in ${(download.durationMs / 1000).toFixed(1)}s` : undefined}
          color="#00E5FF"
          icon={<ArrowDown />}
        />
        <StatCard
          label="Upload"
          value={upload ? formatMbps(upload.mbps) : "—"}
          sub={upload ? `${(upload.bytes / 1e6).toFixed(0)} MB in ${(upload.durationMs / 1000).toFixed(1)}s` : undefined}
          color="#F59E0B"
          icon={<ArrowUp />}
        />
        <StatCard
          label="Ping"
          value={ping ? `${ping.avg} ms` : "—"}
          sub={ping ? `min ${ping.min} · max ${ping.max}` : undefined}
          color="#A3FF47"
          icon={<WaveIcon />}
        />
        <StatCard
          label="Jitter"
          value={ping ? `${ping.jitter} ms` : "—"}
          sub={ping ? `${ping.samples.length} samples` : undefined}
          color="#C084FC"
          icon={<JitterIcon />}
        />
      </div>

      {/* ── Score bar ────────────────────────────────────────────────────── */}
      <div
        className="rounded-xl border px-5 py-4 flex items-center justify-between"
        style={{ borderColor: `${scoreColor}20`, background: `${scoreColor}06` }}
      >
        <div>
          <p className="text-[10px] text-[#4A5568] uppercase tracking-widest mb-1">Network Score</p>
          <p className="text-sm font-medium" style={{ color: scoreColor }}>{scoreText}</p>
        </div>
        <div
          className="font-display text-4xl font-bold tabular-nums"
          style={{ color: scoreColor, textShadow: `0 0 24px ${scoreColor}55` }}
        >
          {score}
        </div>
      </div>

      {/* ── Ping sparkline ────────────────────────────────────────────────── */}
      {ping && ping.samples.length > 1 && (
        <div className="rounded-xl border border-[#1C2030] bg-[#0A0D13] p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-[#4A5568] uppercase tracking-widest">Ping over time</p>
            <span className="text-[10px] text-[#2D3748] tabular-nums">
              avg {ping.avg}ms · jitter {ping.jitter}ms
            </span>
          </div>
          <PingChart samples={ping.samples} color="#A3FF47" height={52} />
        </div>
      )}

      {/* ── Server + network details ──────────────────────────────────────── */}
      <div className="rounded-xl border border-[#1C2030] bg-[#0A0D13] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1C2030]">
          <p className="text-[10px] text-[#2D3748] uppercase tracking-widest">Test Details</p>
        </div>
        <div className="divide-y divide-[#0F1219]">
          {[
            { label: "Server",     value: `${server.name} · ${serverHostname(server)}` },
            { label: "Tested",     value: timestamp },
            ...(network ? [
              { label: "IP",       value: network.ip  },
              { label: "ISP",      value: network.isp },
              { label: "Location", value: [network.city, network.country].filter(Boolean).join(", ") },
            ] : []),
            { label: "Browser",    value: `${browser.name} ${browser.version}` },
            { label: "OS",         value: browser.os },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center px-4 py-2.5 gap-4">
              <span className="text-[10px] text-[#2D3748] uppercase tracking-widest w-20 flex-shrink-0">
                {label}
              </span>
              <span className="text-xs text-[#94A3B8] truncate">{value || "—"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <button
          onClick={onReset}
          className="flex-1 py-3 rounded-xl bg-[#00E5FF] text-[#090B10] font-semibold text-sm tracking-wide hover:bg-white transition-colors duration-200"
          style={{ boxShadow: "0 0 24px rgba(0,229,255,0.25)" }}
        >
          ↺ Test Again
        </button>
        <Link href="/" className="flex-1">
          <button className="w-full py-3 rounded-xl border border-[#1C2030] text-[#4A5568] text-sm hover:border-[#2D3748] hover:text-[#94A3B8] transition-colors duration-200">
            ← Home
          </button>
        </Link>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color, icon,
}: {
  label: string; value: string; sub?: string;
  color: string; icon: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border bg-[#0A0D13] p-4 flex flex-col gap-2.5 relative overflow-hidden"
      style={{ borderColor: `${color}18` }}
    >
      {/* Corner glow */}
      <div
        className="absolute top-0 right-0 w-16 h-16 pointer-events-none opacity-[0.07]"
        style={{ background: `radial-gradient(circle at top right, ${color}, transparent)` }}
      />
      <div className="flex items-center gap-2">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}12`, color }}
        >
          {icon}
        </div>
        <span className="text-[10px] text-[#2D3748] uppercase tracking-widest">{label}</span>
      </div>
      <div>
        <div
          className="font-display text-2xl font-bold leading-none tabular-nums"
          style={{ color, textShadow: `0 0 16px ${color}44` }}
        >
          {value}
        </div>
        {sub && (
          <div className="text-[10px] text-[#2D3748] mt-1 tabular-nums">{sub}</div>
        )}
      </div>
    </div>
  );
}

// ─── Error Screen ─────────────────────────────────────────────────────────────

function ErrorScreen({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 gap-6">
      <div className="w-14 h-14 rounded-full border border-red-900/40 bg-red-950/20 flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={1.5} className="w-7 h-7">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-medium text-white mb-2">Test failed</h2>
        <p className="text-[#4A5568] text-sm max-w-sm">
          {message ?? "Something went wrong. Check your connection and try again."}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="px-8 py-3 rounded-xl bg-[#00E5FF] text-[#090B10] font-semibold text-sm"
      >
        Try Again
      </button>
    </div>
  );
}

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

function ArrowDown() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-3.5 h-3.5">
      <polyline points="4,8 8,12 12,8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="8" y1="3" x2="8" y2="12" strokeLinecap="round" />
    </svg>
  );
}
function ArrowUp() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-3.5 h-3.5">
      <polyline points="4,8 8,4 12,8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="8" y1="4" x2="8" y2="13" strokeLinecap="round" />
    </svg>
  );
}
function WaveIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
      <polyline points="1,8 3.5,8 5,4 7,12 9,8 11,8 12.5,5 14,8 15,8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function JitterIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
      <polyline points="1,8 3,5 5,11 7,4 9,10 11,6 13,9 15,8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
