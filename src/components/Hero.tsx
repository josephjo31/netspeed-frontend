"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export default function Hero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Animated radar sweep on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 320;
    canvas.height = 320;

    let angle = 0;
    let animId: number;

    const draw = () => {
      ctx.clearRect(0, 0, 320, 320);
      const cx = 160,
        cy = 160,
        r = 140;

      // Rings
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (r * i) / 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,229,255,${0.08 + i * 0.02})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Crosshairs
      ctx.strokeStyle = "rgba(0,229,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();

      // Sweep gradient
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, "rgba(0,229,255,0.25)");
      grad.addColorStop(1, "rgba(0,229,255,0)");

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, -0.4, 0.05);
      ctx.closePath();
      ctx.fillStyle = "rgba(0,229,255,0.12)";
      ctx.fill();

      // Sweep line
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(r, 0);
      ctx.strokeStyle = "rgba(0,229,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#00E5FF";
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.restore();

      // Blips
      const blips = [
        { a: 0.8, d: 0.45 },
        { a: 2.1, d: 0.7 },
        { a: 3.5, d: 0.55 },
        { a: 5.0, d: 0.3 },
      ];
      blips.forEach(({ a, d }) => {
        const bx = cx + Math.cos(a) * r * d;
        const by = cy + Math.sin(a) * r * d;
        const behind = ((a - angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const fade = behind < Math.PI * 1.5 ? 1 - behind / (Math.PI * 1.5) : 0;
        if (fade > 0.05) {
          ctx.beginPath();
          ctx.arc(bx, by, 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0,229,255,${fade})`;
          ctx.shadowColor = "#00E5FF";
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#00E5FF";
      ctx.shadowColor = "#00E5FF";
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      angle += 0.018;
      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background grid */}
      <div
        className="absolute inset-0 bg-grid-pattern bg-grid opacity-100"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,229,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Radial glow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(0,229,255,0.1), transparent 70%)",
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          {/* Text */}
          <div className="flex-1 text-center lg:text-left">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#1C2030] bg-[#0F1219] mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-pulse" />
              <span className="font-display text-xs text-[#00E5FF] tracking-[0.2em] uppercase">
                Internet & Gaming Analyzer
              </span>
            </div>

            {/* Headline */}
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl text-white leading-tight mb-4">
              TEST YOUR
              <br />
              <span
                className="text-[#00E5FF]"
                style={{ textShadow: "0 0 30px rgba(0,229,255,0.5)" }}
              >
                CONNECTION.
              </span>
              <br />
              MASTER YOUR
              <br />
              <span
                className="text-[#A3FF47]"
                style={{ textShadow: "0 0 30px rgba(163,255,71,0.5)" }}
              >
                PING.
              </span>
            </h1>

            <p className="text-[#94A3B8] text-base sm:text-lg leading-relaxed mb-10 max-w-lg mx-auto lg:mx-0">
              Real-time network diagnostics for everyday users and competitive
              gamers. Know your speeds, track your latency, dominate your
              lobbies.
            </p>

            {/* Stats bar */}
            <div className="flex items-center justify-center lg:justify-start gap-6 mb-10">
              {[
                { label: "Avg Accuracy", value: "99.8%" },
                { label: "Tests Run", value: "2.4M+" },
                { label: "Countries", value: "180+" },
              ].map(({ label, value }) => (
                <div key={label} className="text-center lg:text-left">
                  <div className="font-display text-xl text-[#00E5FF]">
                    {value}
                  </div>
                  <div className="text-[10px] text-[#4A5568] uppercase tracking-widest">
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link href="/test">
                <button className="px-8 py-3 rounded bg-[#00E5FF] text-[#090B10] font-semibold text-sm tracking-wide hover:bg-white transition-all duration-200 glow-accent">
                  Start Testing →
                </button>
              </Link>
              <a href="#features">
                <button className="px-8 py-3 rounded border border-[#1C2030] text-[#94A3B8] font-medium text-sm tracking-wide hover:border-[#00E5FF] hover:text-[#00E5FF] transition-all duration-200">
                  View Features
                </button>
              </a>
            </div>
          </div>

          {/* Radar visual */}
          <div className="flex-shrink-0 relative">
            <div
              className="w-72 h-72 sm:w-80 sm:h-80 rounded-full relative"
              style={{
                background:
                  "radial-gradient(circle, rgba(0,229,255,0.05) 0%, rgba(9,11,16,0) 70%)",
                boxShadow:
                  "0 0 60px rgba(0,229,255,0.15), inset 0 0 60px rgba(0,229,255,0.03)",
              }}
            >
              <canvas
                ref={canvasRef}
                className="w-full h-full"
                style={{ borderRadius: "50%" }}
              />
            </div>
            {/* Floating metric badges */}
            <div className="absolute -top-3 -right-3 px-3 py-1.5 rounded-lg bg-[#0F1219] border border-[#1C2030] text-xs font-display text-[#00E5FF]">
              DL: 245 Mbps
            </div>
            <div className="absolute -bottom-3 -left-3 px-3 py-1.5 rounded-lg bg-[#0F1219] border border-[#1C2030] text-xs font-display text-[#A3FF47]">
              PING: 12ms
            </div>
          </div>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#090B10] to-transparent" />
    </section>
  );
}
