"use client";

import { useEffect, useRef } from "react";

interface SpeedGaugeProps {
  value: number;    // current Mbps or ms — written to a ref, never a useEffect dep
  max: number;      // scale max
  unit: string;     // "Mbps" | "ms"
  label: string;
  color: string;    // hex
  active: boolean;
  size?: number;
}

export default function SpeedGauge({
  value,
  max,
  unit,
  label,
  color,
  active,
  size = 200,
}: SpeedGaugeProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const animRef    = useRef<number>(0);

  // ── Target and display values live in refs so the animation loop can read
  // the latest value on every frame WITHOUT being listed as a useEffect dep.
  // Changing `value` no longer restarts the effect or the canvas.
  const targetRef  = useRef<number>(value);
  const displayRef = useRef<number>(0);

  // ── Keep the target ref in sync with the prop on every render.
  // This is a plain assignment during render — safe and cheap.
  targetRef.current = value;

  // ── Canvas setup + animation loop: runs ONCE on mount (and only again if
  // the static props max/unit/label/color/active/size change, which is rare).
  // `value` is intentionally NOT in the dependency array.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Canvas dimensions are set once here, not on every value change.
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width  = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const r  = size * 0.4;
    const startAngle = Math.PI * 0.75;
    const endAngle   = Math.PI * 2.25;
    const totalAngle = endAngle - startAngle;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);

      // ── Track background ──────────────────────────────────────────────────
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth   = size * 0.06;
      ctx.lineCap     = "round";
      ctx.stroke();

      // ── Tick marks ────────────────────────────────────────────────────────
      const ticks = 20;
      for (let i = 0; i <= ticks; i++) {
        const a     = startAngle + (i / ticks) * totalAngle;
        const inner = i % 5 === 0 ? r * 0.78 : r * 0.84;
        const outer = r * 0.9;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        ctx.strokeStyle = i % 5 === 0
          ? `rgba(${hexToRgb(color)},0.5)`
          : "rgba(255,255,255,0.1)";
        ctx.lineWidth = i % 5 === 0 ? 2 : 1;
        ctx.stroke();
      }

      // ── Progress arc ──────────────────────────────────────────────────────
      const pct = Math.min(displayRef.current / max, 1);
      if (pct > 0) {
        const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
        grad.addColorStop(0, `rgba(${hexToRgb(color)},0.4)`);
        grad.addColorStop(1, color);
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, startAngle + totalAngle * pct);
        ctx.strokeStyle = grad;
        ctx.lineWidth   = size * 0.06;
        ctx.lineCap     = "round";
        ctx.shadowColor = color;
        ctx.shadowBlur  = active ? 12 : 4;
        ctx.stroke();
        ctx.shadowBlur  = 0;
      }

      // ── Needle ────────────────────────────────────────────────────────────
      if (active || displayRef.current > 0) {
        const needleAngle = startAngle + totalAngle * Math.min(displayRef.current / max, 1);
        const needleLen   = r * 0.65;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(needleAngle) * needleLen, cy + Math.sin(needleAngle) * needleLen);
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        ctx.lineCap     = "round";
        ctx.shadowColor = color;
        ctx.shadowBlur  = 8;
        ctx.stroke();
        ctx.shadowBlur  = 0;

        // Pivot dot
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.04, 0, Math.PI * 2);
        ctx.fillStyle   = color;
        ctx.shadowColor = color;
        ctx.shadowBlur  = 10;
        ctx.fill();
        ctx.shadowBlur  = 0;
      }

      // ── Center value text ─────────────────────────────────────────────────
      const d = displayRef.current;
      const displayVal = d >= 1
        ? d.toFixed(d >= 100 ? 0 : 1)
        : d > 0
        ? (d * 1000).toFixed(0)
        : "—";

      ctx.fillStyle = "#FFFFFF";
      ctx.font      = `bold ${size * 0.18}px 'Share Tech Mono', monospace`;
      ctx.textAlign     = "center";
      ctx.textBaseline  = "middle";
      ctx.fillText(displayVal, cx, cy);

      // ── Unit ──────────────────────────────────────────────────────────────
      ctx.fillStyle = `rgba(${hexToRgb(color)},0.9)`;
      ctx.font      = `${size * 0.08}px 'Share Tech Mono', monospace`;
      ctx.fillText(d > 0 && d < 1 ? "Kbps" : unit, cx, cy + size * 0.15);

      // ── Label ─────────────────────────────────────────────────────────────
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font      = `${size * 0.07}px Inter, sans-serif`;
      ctx.fillText(label, cx, cy + size * 0.28);

      // ── Smoothly interpolate display toward target ─────────────────────────
      // targetRef.current is the latest value written by the parent on each
      // render. Reading it here (inside the rAF loop) means we always track
      // the current prop without the effect needing to re-run.
      const target = targetRef.current;
      const speed  = active ? 0.08 : 0.04;
      displayRef.current += (target - displayRef.current) * speed;

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [max, unit, label, color, active, size]);
  // ↑ `value` is deliberately absent. It is read via targetRef.current inside
  //   the rAF loop so the animation always tracks the latest prop, but the
  //   canvas and loop are never torn down and restarted due to a value change.

  return <canvas ref={canvasRef} style={{ imageRendering: "crisp-edges" }} />;
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
