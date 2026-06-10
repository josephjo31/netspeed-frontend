"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SpeedGauge from "@/components/SpeedGauge";
import PingChart from "@/components/PingChart";
import ResultCard from "@/components/ResultCard";
import {
  fetchNetworkInfo,
  getBrowserInfo,
  getTestMode,
  TEST_SERVER_LABEL,
  measurePing,
  measureDownload,
  measureUpload,
  calculateScore,
  scoreLabel,
  formatMbps,
  type TestResults,
  type NetworkInfo,
  type PingResult,
  type SpeedResult,
} from "@/lib/speedtest";

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase =
  | "idle"
  | "detecting"
  | "ping"
  | "download"
  | "upload"
  | "scoring"
  | "done"
  | "error";

interface LiveState {
  pingMs: number;
  pingSamples: number[];
  downloadMbps: number;
  downloadPct: number;
  uploadMbps: number;
  uploadPct: number;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TestPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TestResults | null>(null);
  const [live, setLive] = useState<LiveState>({
    pingMs: 0,
    pingSamples: [],
    downloadMbps: 0,
    downloadPct: 0,
    uploadMbps: 0,
    uploadPct: 0,
  });

  const abortRef = useRef(false);

  const resetLive = () =>
    setLive({
      pingMs: 0,
      pingSamples: [],
      downloadMbps: 0,
      downloadPct: 0,
      uploadMbps: 0,
      uploadPct: 0,
    });

  const runTest = useCallback(async () => {
    abortRef.current = false;
    setError(null);
    setResults(null);
    resetLive();

    try {
      // Each phase is individually guarded: a failed step yields a null
      // result but the test always runs to completion.

      // ── 1. Detect network / ISP ──────────────────────────────────────────
      setPhase("detecting");
      let network: NetworkInfo | null = null;
      const browser = getBrowserInfo();
      try {
        network = await fetchNetworkInfo();
      } catch (e) {
        console.warn("Network detection failed:", e);
      }

      if (abortRef.current) return;

      // ── 2. Ping & Jitter ─────────────────────────────────────────────────
      setPhase("ping");
      let pingResult: PingResult | null = null;

      try {
        pingResult = await measurePing(10, (ms, i) => {
          if (abortRef.current) return;
          setLive((prev) => ({
            ...prev,
            pingMs: ms,
            pingSamples: [...prev.pingSamples, ms],
          }));
        });
      } catch (e) {
        console.warn("Ping test failed:", e);
      }

      if (abortRef.current) return;

      // ── 3. Download ──────────────────────────────────────────────────────
      setPhase("download");
      let downloadResult: SpeedResult | null = null;

      try {
        downloadResult = await measureDownload((pct, mbps) => {
          if (abortRef.current) return;
          setLive((prev) => ({
            ...prev,
            downloadMbps: mbps,
            downloadPct: pct,
          }));
        });
      } catch (e) {
        console.warn("Download test failed:", e);
      }

      if (abortRef.current) return;

      // ── 4. Upload ────────────────────────────────────────────────────────
      setPhase("upload");
      let uploadResult: SpeedResult | null = null;

      try {
        uploadResult = await measureUpload((pct, mbps) => {
          if (abortRef.current) return;
          setLive((prev) => ({
            ...prev,
            uploadMbps: mbps,
            uploadPct: pct,
          }));
        });
      } catch (e) {
        console.warn("Upload test failed:", e);
      }

      if (abortRef.current) return;

      // ── 5. Score & finalise ──────────────────────────────────────────────
      setPhase("scoring");
      await new Promise((r) => setTimeout(r, 800)); // brief dramatic pause

      const score = calculateScore(downloadResult, uploadResult, pingResult);

      const finalResults: TestResults = {
        network,
        ping: pingResult,
        download: downloadResult,
        upload: uploadResult,
        packetLoss: "unavailable",
        browser,
        server: TEST_SERVER_LABEL,
        mode: getTestMode(),
        score,
        timestamp: new Date().toLocaleString(),
      };

      setResults(finalResults);
      setPhase("done");
    } catch (err: unknown) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Please try again."
      );
      setPhase("error");
    }
  }, []);

  const handleReset = () => {
    abortRef.current = true;
    setPhase("idle");
    setResults(null);
    setError(null);
    resetLive();
  };

  return (
    <div className="min-h-screen bg-[#090B10] flex flex-col">
      <Navbar />

      <main className="flex-1 pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div className="mb-10 flex items-center gap-4">
            <Link
              href="/"
              className="text-[#4A5568] hover:text-[#00E5FF] transition-colors text-sm flex items-center gap-1"
            >
              ← Home
            </Link>
            <span className="text-[#1C2030]">/</span>
            <span className="font-display text-xs tracking-[0.2em] text-[#00E5FF] uppercase">
              Speed Test
            </span>
          </div>

          {/* ── Idle state ───────────────────────────────────────────────── */}
          {phase === "idle" && (
            <IdleScreen onStart={runTest} />
          )}

          {/* ── Active test ──────────────────────────────────────────────── */}
          {(phase === "detecting" ||
            phase === "ping" ||
            phase === "download" ||
            phase === "upload" ||
            phase === "scoring") && (
            <ActiveTest phase={phase} live={live} />
          )}

          {/* ── Results ──────────────────────────────────────────────────── */}
          {phase === "done" && results && (
            <Results results={results} onReset={handleReset} />
          )}

          {/* ── Error ────────────────────────────────────────────────────── */}
          {phase === "error" && (
            <ErrorScreen message={error} onRetry={runTest} />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

// ─── Idle Screen ──────────────────────────────────────────────────────────────

function IdleScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 gap-8">
      {/* Animated ring button */}
      <div className="relative group cursor-pointer" onClick={onStart}>
        <div className="absolute inset-0 rounded-full border border-[#00E5FF]/20 scale-110 group-hover:scale-125 transition-all duration-700 animate-pulse-slow" />
        <div className="absolute inset-0 rounded-full border border-[#00E5FF]/10 scale-125 group-hover:scale-150 transition-all duration-700" />
        <button
          className="relative w-48 h-48 rounded-full border-2 border-[#00E5FF] bg-[#00E5FF]/5 flex flex-col items-center justify-center gap-2 hover:bg-[#00E5FF]/10 transition-all duration-200 group-hover:border-[#00E5FF]"
          style={{ boxShadow: "0 0 40px rgba(0,229,255,0.15)" }}
          aria-label="Start speed test"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#00E5FF"
            strokeWidth={1.5}
            className="w-10 h-10"
          >
            <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-display text-[#00E5FF] text-lg tracking-widest">
            GO
          </span>
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-white mb-2">
          Network Speed Test
        </h1>
        <p className="text-[#4A5568] text-sm max-w-sm">
          Tests download, upload, ping, jitter, and identifies your ISP and
          location. Takes about 30 seconds.
        </p>
      </div>

      {/* What we test */}
      <div className="flex flex-wrap justify-center gap-2 text-xs">
        {[
          { label: "Download", color: "#00E5FF" },
          { label: "Upload", color: "#00E5FF" },
          { label: "Ping", color: "#A3FF47" },
          { label: "Jitter", color: "#A3FF47" },
          { label: "ISP Detection", color: "#94A3B8" },
          { label: "Location", color: "#94A3B8" },
        ].map(({ label, color }) => (
          <span
            key={label}
            className="px-3 py-1 rounded-full border text-xs"
            style={{
              borderColor: `${color}22`,
              color,
              background: `${color}08`,
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Active Test ──────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  detecting: "Detecting your network…",
  ping: "Measuring ping & jitter…",
  download: "Testing download speed…",
  upload: "Testing upload speed…",
  scoring: "Calculating your score…",
};

function ActiveTest({
  phase,
  live,
}: {
  phase: Phase;
  live: LiveState;
}) {
  const steps = ["detecting", "ping", "download", "upload", "scoring"];
  const stepIdx = steps.indexOf(phase);

  return (
    <div className="flex flex-col items-center gap-10">
      {/* Phase label */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#1C2030] bg-[#0F1219] mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-pulse" />
          <span className="font-display text-xs text-[#00E5FF] tracking-[0.15em] uppercase">
            {PHASE_LABELS[phase] ?? "Running…"}
          </span>
        </div>

        {/* Step progress bar */}
        <div className="flex items-center gap-1.5 justify-center">
          {steps.map((s, i) => (
            <div
              key={s}
              className="h-1 rounded-full transition-all duration-500"
              style={{
                width: i === stepIdx ? 32 : 8,
                background:
                  i < stepIdx
                    ? "#00E5FF"
                    : i === stepIdx
                    ? "#00E5FF"
                    : "#1C2030",
                opacity: i === stepIdx ? 1 : i < stepIdx ? 0.5 : 0.2,
              }}
            />
          ))}
        </div>
      </div>

      {/* Gauges row */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-8 w-full">
        {/* Download gauge */}
        <div
          className="flex flex-col items-center gap-2 transition-opacity duration-500"
          style={{ opacity: phase === "download" || phase === "scoring" || phase === "upload" ? 1 : 0.25 }}
        >
          <SpeedGauge
            value={live.downloadMbps}
            max={500}
            unit="Mbps"
            label="Download"
            color="#00E5FF"
            active={phase === "download"}
            size={180}
          />
          {phase === "download" && (
            <div className="h-1.5 rounded-full bg-[#1C2030] w-36 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#00E5FF] transition-all duration-300"
                style={{ width: `${live.downloadPct}%` }}
              />
            </div>
          )}
        </div>

        {/* Ping / Jitter center column */}
        <div className="flex flex-col items-center gap-4 min-w-[140px]">
          {/* Ping value */}
          <div className="text-center">
            <div
              className="font-display text-4xl font-bold transition-all duration-200"
              style={{
                color: live.pingMs > 0 ? "#A3FF47" : "#2D3748",
                textShadow: live.pingMs > 0 ? "0 0 20px rgba(163,255,71,0.5)" : "none",
              }}
            >
              {live.pingMs > 0 ? live.pingMs : "—"}
            </div>
            <div className="font-display text-xs text-[#4A5568] tracking-widest mt-1">
              PING (ms)
            </div>
          </div>

          {/* Live sparkline */}
          {live.pingSamples.length > 1 && (
            <PingChart
              samples={live.pingSamples}
              color="#A3FF47"
              width={140}
              height={50}
            />
          )}

          {/* Phase indicator */}
          <div
            className="font-display text-[10px] tracking-widest uppercase px-2 py-0.5 rounded"
            style={{
              color:
                phase === "ping"
                  ? "#A3FF47"
                  : phase === "download"
                  ? "#00E5FF"
                  : phase === "upload"
                  ? "#F59E0B"
                  : "#4A5568",
              background:
                phase === "ping"
                  ? "rgba(163,255,71,0.08)"
                  : phase === "download"
                  ? "rgba(0,229,255,0.08)"
                  : phase === "upload"
                  ? "rgba(245,158,11,0.08)"
                  : "rgba(74,85,104,0.08)",
            }}
          >
            {phase === "detecting" ? "Detecting" : phase}
          </div>
        </div>

        {/* Upload gauge */}
        <div
          className="flex flex-col items-center gap-2 transition-opacity duration-500"
          style={{ opacity: phase === "upload" || phase === "scoring" ? 1 : 0.25 }}
        >
          <SpeedGauge
            value={live.uploadMbps}
            max={250}
            unit="Mbps"
            label="Upload"
            color="#F59E0B"
            active={phase === "upload"}
            size={180}
          />
          {phase === "upload" && (
            <div className="h-1.5 rounded-full bg-[#1C2030] w-36 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#F59E0B] transition-all duration-300"
                style={{ width: `${live.uploadPct}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Detecting info placeholder */}
      {phase === "detecting" && (
        <div className="flex gap-3 flex-wrap justify-center">
          {["IP Address", "ISP", "Location", "Browser"].map((item) => (
            <div
              key={item}
              className="px-4 py-2 rounded-lg border border-[#1C2030] bg-[#0F1219] flex items-center gap-2"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-pulse" />
              <span className="text-xs text-[#4A5568]">{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Results Screen ───────────────────────────────────────────────────────────

function Results({
  results,
  onReset,
}: {
  results: TestResults;
  onReset: () => void;
}) {
  const { ping, download, upload, network, browser, score, timestamp } = results;
  const { label: scoreText, color: scoreColor } = scoreLabel(score);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Score hero */}
      <div
        className="rounded-2xl border p-8 text-center relative overflow-hidden"
        style={{
          borderColor: `${scoreColor}33`,
          background: `linear-gradient(135deg, #0F1219 0%, ${scoreColor}08 100%)`,
        }}
      >
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 0%, ${scoreColor}, transparent 60%)`,
          }}
        />
        <p className="font-display text-xs tracking-[0.3em] text-[#4A5568] uppercase mb-2">
          Your Score
        </p>
        <div
          className="font-display text-7xl font-bold leading-none mb-2"
          style={{ color: scoreColor, textShadow: `0 0 40px ${scoreColor}66` }}
        >
          {score}
        </div>
        <div
          className="inline-flex px-4 py-1 rounded-full text-sm font-medium border mb-4"
          style={{
            color: scoreColor,
            borderColor: `${scoreColor}33`,
            background: `${scoreColor}12`,
          }}
        >
          {scoreText}
        </div>
        <div className="mb-3">
          <span
            className="inline-flex items-center px-3 py-1 rounded-full font-display text-[10px] tracking-[0.15em] uppercase border"
            style={{
              color: "#A3FF47",
              borderColor: "#A3FF4733",
              background: "#A3FF4710",
            }}
          >
            Real Server Test
          </span>
        </div>
        <p className="text-xs text-[#4A5568]">Tested {timestamp}</p>
      </div>

      {/* Main metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ResultCard
          label="Download"
          value={download ? formatMbps(download.mbps) : "—"}
          sub={download ? `${(download.bytes / 1e6).toFixed(1)} MB in ${(download.durationMs / 1000).toFixed(1)}s` : undefined}
          color="#00E5FF"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <polyline points="8 17 12 21 16 17" />
              <line x1="12" y1="3" x2="12" y2="21" />
            </svg>
          }
        />
        <ResultCard
          label="Upload"
          value={upload ? formatMbps(upload.mbps) : "—"}
          sub={upload ? `${(upload.bytes / 1e6).toFixed(1)} MB in ${(upload.durationMs / 1000).toFixed(1)}s` : undefined}
          color="#F59E0B"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <polyline points="16 7 12 3 8 7" />
              <line x1="12" y1="21" x2="12" y2="3" />
            </svg>
          }
        />
        <ResultCard
          label="Ping"
          value={ping ? `${ping.avg} ms` : "—"}
          sub={ping ? `Min ${ping.min}ms · Max ${ping.max}ms` : undefined}
          color="#A3FF47"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          }
        />
        <ResultCard
          label="Jitter"
          value={ping ? `${ping.jitter} ms` : "—"}
          sub={ping ? `${ping.samples.length} samples` : undefined}
          color="#C084FC"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M2 12 Q6 4 10 12 Q14 20 18 12 Q20 8 22 12" />
            </svg>
          }
        />
      </div>

      {/* Ping sparkline */}
      {ping && ping.samples.length > 1 && (
        <div className="rounded-xl border border-[#1C2030] bg-[#0F1219] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-[#4A5568] uppercase tracking-widest mb-0.5">
                Ping over time
              </p>
              <p className="text-sm text-white">
                {ping.samples.length} samples · avg {ping.avg}ms · jitter{" "}
                {ping.jitter}ms
              </p>
            </div>
            <div className="font-display text-xs text-[#A3FF47]">
              {ping.min}ms — {ping.max}ms
            </div>
          </div>
          <div className="w-full">
            <PingChart
              samples={ping.samples}
              color="#A3FF47"
              height={64}
            />
          </div>
        </div>
      )}

      {/* Packet loss */}
      <ResultCard
        label="Packet Loss"
        value="Unavailable"
        color="#4A5568"
        note="Browser security restrictions prevent raw ICMP/UDP packet-loss measurement. For accurate packet loss, use a desktop tool like PingPlotter or WinMTR."
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        }
      />

      {/* Network info grid */}
      {network && (
        <div className="rounded-xl border border-[#1C2030] bg-[#0F1219] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1C2030]">
            <p className="text-xs text-[#4A5568] uppercase tracking-widest">
              Network Details
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-0 divide-x divide-y divide-[#1C2030]">
            {[
              { label: "IP Address", value: network.ip },
              { label: "ISP", value: network.isp },
              { label: "Country", value: network.country },
              { label: "City", value: `${network.city}${network.region ? `, ${network.region}` : ""}` },
              { label: "Timezone", value: network.timezone || "—" },
              { label: "Server", value: results.server },
            ].map(({ label, value }) => (
              <div key={label} className="px-5 py-4">
                <p className="text-[10px] text-[#4A5568] uppercase tracking-widest mb-1">
                  {label}
                </p>
                <p className="text-sm text-white font-medium truncate">{value || "—"}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Browser info */}
      <div className="rounded-xl border border-[#1C2030] bg-[#0F1219] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1C2030]">
          <p className="text-xs text-[#4A5568] uppercase tracking-widest">
            Client Info
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-y divide-[#1C2030]">
          {[
            { label: "Browser", value: `${browser.name} ${browser.version}` },
            { label: "OS", value: browser.os },
            { label: "Connection", value: browser.connection },
            { label: "Protocol", value: "HTTPS" },
          ].map(({ label, value }) => (
            <div key={label} className="px-5 py-4">
              <p className="text-[10px] text-[#4A5568] uppercase tracking-widest mb-1">
                {label}
              </p>
              <p className="text-sm text-white font-medium truncate">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
        <button
          onClick={onReset}
          className="px-8 py-3 rounded-xl bg-[#00E5FF] text-[#090B10] font-semibold text-sm tracking-wide hover:bg-white transition-all duration-200 w-full sm:w-auto"
          style={{ boxShadow: "0 0 20px rgba(0,229,255,0.3)" }}
        >
          ↺ Run Again
        </button>
        <Link href="/#tests" className="w-full sm:w-auto">
          <button className="w-full px-8 py-3 rounded-xl border border-[#1C2030] text-[#94A3B8] text-sm font-medium hover:border-[#00E5FF] hover:text-[#00E5FF] transition-all duration-200">
            Try Gaming Test →
          </button>
        </Link>
      </div>
    </div>
  );
}

// ─── Error Screen ─────────────────────────────────────────────────────────────

function ErrorScreen({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 gap-6">
      <div className="w-16 h-16 rounded-full border border-red-500/20 bg-red-500/05 flex items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#EF4444"
          strokeWidth={1.5}
          className="w-8 h-8"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">Test failed</h2>
        <p className="text-[#4A5568] text-sm max-w-sm">
          {message ?? "Something went wrong. Check your connection and try again."}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="px-8 py-3 rounded-xl bg-[#00E5FF] text-[#090B10] font-semibold text-sm tracking-wide hover:bg-white transition-all duration-200"
      >
        Try Again
      </button>
    </div>
  );
}
