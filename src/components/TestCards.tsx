"use client";

import Link from "next/link";

const normalFeatures = [
  {
    icon: "↓",
    label: "Download Speed",
    desc: "Measure your real throughput in Mbps",
    color: "accent",
  },
  {
    icon: "↑",
    label: "Upload Speed",
    desc: "Test outbound bandwidth for streaming & calls",
    color: "accent",
  },
  {
    icon: "◎",
    label: "Ping",
    desc: "Latency to nearest test server in ms",
    color: "accent",
  },
  {
    icon: "≋",
    label: "Jitter",
    desc: "Variation in ping — critical for VoIP",
    color: "accent",
  },
  {
    icon: "✕",
    label: "Packet Loss",
    desc: "Dropped packets as a % of total sent",
    color: "accent",
  },
  {
    icon: "⬡",
    label: "ISP Detection",
    desc: "Auto-identify your internet provider",
    color: "accent",
  },
  {
    icon: "⊙",
    label: "Server Detection",
    desc: "Nearest test node for accurate results",
    color: "accent",
  },
];

const gamingFeatures = [
  {
    icon: "🔫",
    label: "CS2 Ping",
    desc: "Valve servers — EU, NA, Asia",
    color: "lime",
  },
  {
    icon: "🚀",
    label: "Rocket League",
    desc: "Psyonix servers across all regions",
    color: "lime",
  },
  {
    icon: "⚡",
    label: "Valorant Ping",
    desc: "Riot Games server latency check",
    color: "lime",
  },
  {
    icon: "🪖",
    label: "PUBG Ping",
    desc: "Krafton's server network diagnostics",
    color: "lime",
  },
  {
    icon: "🎮",
    label: "Fortnite Ping",
    desc: "Epic Games matchmaking latency",
    color: "lime",
  },
];

function FeatureRow({
  icon,
  label,
  desc,
  color,
}: {
  icon: string;
  label: string;
  desc: string;
  color: "accent" | "lime";
}) {
  const c = color === "accent" ? "#00E5FF" : "#A3FF47";
  return (
    <div className="flex items-start gap-3 group">
      <div
        className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center text-sm"
        style={{
          background: `rgba(${color === "accent" ? "0,229,255" : "163,255,71"},0.08)`,
          color: c,
        }}
      >
        {icon}
      </div>
      <div>
        <div className="text-sm font-medium text-white leading-tight">{label}</div>
        <div className="text-xs text-[#4A5568] mt-0.5">{desc}</div>
      </div>
    </div>
  );
}

export default function TestCards() {
  return (
    <section id="tests" className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <p className="font-display text-xs tracking-[0.3em] text-[#00E5FF] uppercase mb-3">
            Choose Your Test
          </p>
          <h2 className="text-3xl sm:text-4xl font-semibold text-white">
            Two modes. One tool.
          </h2>
          <p className="mt-4 text-[#94A3B8] max-w-xl mx-auto">
            Whether you need a full connection report or game-specific latency
            checks, NetSpeed.me has you covered.
          </p>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Normal Test Card */}
          <div
            className="relative rounded-2xl p-8 border border-[#1C2030] bg-[#0F1219] overflow-hidden group hover:border-[#00E5FF]/50 transition-all duration-300"
            style={{
              boxShadow: "0 0 0 0 rgba(0,229,255,0)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 0 40px rgba(0,229,255,0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 0 0 0 rgba(0,229,255,0)";
            }}
          >
            {/* Corner accent */}
            <div className="absolute top-0 right-0 w-24 h-24 opacity-10">
              <div
                className="absolute inset-0 rounded-bl-full"
                style={{
                  background:
                    "radial-gradient(circle at top right, #00E5FF, transparent)",
                }}
              />
            </div>

            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-[#00E5FF]/10 flex items-center justify-center">
                <span className="text-[#00E5FF] text-lg">◉</span>
              </div>
              <div>
                <p className="font-display text-[10px] tracking-[0.2em] text-[#00E5FF] uppercase">
                  Mode 01
                </p>
                <h3 className="text-xl font-semibold text-white">
                  Normal Test
                </h3>
              </div>
            </div>

            <p className="text-sm text-[#4A5568] mb-8">
              Full ISP diagnostic — ideal for troubleshooting, comparing plans,
              or sharing results.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {normalFeatures.map((f) => (
                <FeatureRow key={f.label} {...f} color="accent" />
              ))}
            </div>

            <Link href="/test">
              <button className="w-full py-3 rounded-xl bg-[#00E5FF]/10 border border-[#00E5FF]/20 text-[#00E5FF] font-medium text-sm tracking-wide hover:bg-[#00E5FF] hover:text-[#090B10] transition-all duration-200">
                Run Normal Test →
              </button>
            </Link>
          </div>

          {/* Gaming Test Card */}
          <div
            className="relative rounded-2xl p-8 border border-[#1C2030] bg-[#0F1219] overflow-hidden hover:border-[#A3FF47]/50 transition-all duration-300"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 0 40px rgba(163,255,71,0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 0 0 0 rgba(163,255,71,0)";
            }}
          >
            {/* Corner accent */}
            <div className="absolute top-0 right-0 w-24 h-24 opacity-10">
              <div
                className="absolute inset-0 rounded-bl-full"
                style={{
                  background:
                    "radial-gradient(circle at top right, #A3FF47, transparent)",
                }}
              />
            </div>

            {/* Gaming badge */}
            <div className="absolute top-6 right-6">
              <span className="px-2 py-0.5 rounded-full bg-[#A3FF47]/10 border border-[#A3FF47]/20 text-[#A3FF47] text-[10px] font-display tracking-widest">
                GAMER
              </span>
            </div>

            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-[#A3FF47]/10 flex items-center justify-center">
                <span className="text-[#A3FF47] text-lg">⊹</span>
              </div>
              <div>
                <p className="font-display text-[10px] tracking-[0.2em] text-[#A3FF47] uppercase">
                  Mode 02
                </p>
                <h3 className="text-xl font-semibold text-white">
                  Gaming Test
                </h3>
              </div>
            </div>

            <p className="text-sm text-[#4A5568] mb-8">
              Game-server specific latency checks. Know your actual in-game
              ping before you queue.
            </p>

            <div className="grid grid-cols-1 gap-4 mb-8">
              {gamingFeatures.map((f) => (
                <FeatureRow key={f.label} {...f} color="lime" />
              ))}
            </div>

            <Link href="/test">
              <button className="w-full py-3 rounded-xl bg-[#A3FF47]/10 border border-[#A3FF47]/20 text-[#A3FF47] font-medium text-sm tracking-wide hover:bg-[#A3FF47] hover:text-[#090B10] transition-all duration-200">
                Run Gaming Test →
              </button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
