"use client";

import { useEffect, useRef } from "react";

interface PingChartProps {
  samples: number[];
  color?: string;
  width?: number;
  height?: number;
}

export default function PingChart({
  samples,
  color = "#00E5FF",
  width,
  height = 60,
}: PingChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || samples.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = width ?? container?.clientWidth ?? 200;
    const h = height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const max = Math.max(...samples, 100);
    const pts = samples.map((v, i) => ({
      x: (i / (Math.max(samples.length - 1, 1))) * w,
      y: h - (v / max) * (h - 8) - 4,
    }));

    // Fill under line
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `${color}33`);
    grad.addColorStop(1, `${color}00`);

    ctx.beginPath();
    ctx.moveTo(pts[0].x, h);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Last dot
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [samples, color, width, height]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} className="w-full" />
    </div>
  );
}
