"use client";

import { useEffect, useRef } from "react";

interface UnifiedGaugeProps {
  /** Live speed — written to ref, never a useEffect dep */
  value: number;
  /** Scale max: 500 download, 250 upload */
  max: number;
  /** Drives color morph */
  phase: "download" | "upload" | "idle";
  /** 0–100 progress for outer thin ring */
  progress: number;
  /** SVG size in px */
  size?: number;
}

// Parse "r,g,b" string to numbers
function hexToRGB(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

const COLORS = {
  download: hexToRGB("#00E5FF"),
  upload:   hexToRGB("#F59E0B"),
  idle:     [28, 32, 48] as [number, number, number],
};

export default function UnifiedGauge({
  value,
  max,
  phase,
  progress,
  size = 280,
}: UnifiedGaugeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const animRef = useRef<number>(0);

  // All frequently-changing props → refs so the rAF loop stays current
  // without restarting the effect.
  const valueRef    = useRef(value);
  const maxRef      = useRef(max);
  const phaseRef    = useRef(phase);
  const progressRef = useRef(progress);

  valueRef.current    = value;
  maxRef.current      = max;
  phaseRef.current    = phase;
  progressRef.current = progress;

  // Animated state (smooth display values)
  const displayRef = useRef(0);
  const colorRef   = useRef<[number, number, number]>([28, 32, 48]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const cx = size / 2;
    const cy = size / 2;
    const R  = size * 0.42;   // main arc radius
    const Rp = size * 0.455;  // thin progress arc radius
    const SW  = size * 0.052; // main stroke width
    const SWp = size * 0.016; // progress stroke width

    const START_DEG = 135;
    const SWEEP_DEG = 270;

    const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
    const polar = (deg: number, r: number) => ({
      x: cx + r * Math.cos(toRad(deg)),
      y: cy + r * Math.sin(toRad(deg)),
    });

    const arc = (sd: number, ed: number, r: number): string => {
      if (Math.abs(ed - sd) < 0.1) return "";
      const s = polar(sd, r);
      const e = polar(ed, r);
      const large = ed - sd > 180 ? 1 : 0;
      return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
    };

    // Build DOM structure once
    svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);

    const ns = "http://www.w3.org/2000/svg";
    const el = (tag: string, attrs: Record<string, string>) => {
      const e = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
      return e;
    };

    // Defs
    const defs = el("defs", {});
    defs.innerHTML = `
      <filter id="g1"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="g2"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    `;
    svg.appendChild(defs);

    // Background track
    svg.appendChild(el("path", {
      d: arc(START_DEG, START_DEG + SWEEP_DEG, R),
      fill: "none", stroke: "#0D1018",
      "stroke-width": `${SW}`, "stroke-linecap": "round",
    }));

    // 5 major tick marks
    for (let i = 0; i <= 5; i++) {
      const deg = START_DEG + (i / 5) * SWEEP_DEG;
      const s = polar(deg, R - SW * 0.52);
      const e = polar(deg, R + SW * 0.22);
      svg.appendChild(el("line", {
        x1: `${s.x}`, y1: `${s.y}`, x2: `${e.x}`, y2: `${e.y}`,
        stroke: "rgba(255,255,255,0.07)", "stroke-width": "1.5",
        "stroke-linecap": "round",
      }));
    }

    // Progress track
    svg.appendChild(el("path", {
      d: arc(START_DEG, START_DEG + SWEEP_DEG, Rp),
      fill: "none", stroke: "rgba(255,255,255,0.04)",
      "stroke-width": `${SWp}`, "stroke-linecap": "round",
    }));

    // Progress fill arc (animated)
    const progressArcEl = el("path", {
      fill: "none", "stroke-width": `${SWp}`, "stroke-linecap": "round",
    });
    svg.appendChild(progressArcEl);

    // Glow arc (blurred, behind)
    const arcGlowEl = el("path", {
      fill: "none", "stroke-width": `${SW * 1.9}`,
      "stroke-linecap": "round", filter: "url(#g2)", opacity: "0.28",
    });
    svg.appendChild(arcGlowEl);

    // Main speed arc
    const arcMainEl = el("path", {
      fill: "none", "stroke-width": `${SW}`,
      "stroke-linecap": "round", filter: "url(#g1)",
    });
    svg.appendChild(arcMainEl);

    // Dot at arc tip
    const dotEl = el("circle", {
      r: `${SW * 0.58}`, filter: "url(#g2)", opacity: "0",
    });
    svg.appendChild(dotEl);

    // ── rAF loop ──────────────────────────────────────────────────────────────
    let frame = 0;

    const draw = () => {
      frame++;
      const curPhase   = phaseRef.current;
      const curMax     = maxRef.current;
      const curProg    = progressRef.current;
      const targetVal  = valueRef.current;

      // Smooth display value
      const lerpSpeed = curPhase === "idle" ? 0.04 : 0.09;
      displayRef.current += (targetVal - displayRef.current) * lerpSpeed;

      // Smooth color morph
      const [tr, tg, tb] = COLORS[curPhase];
      const [cr, cg, cb] = colorRef.current;
      const cs = 0.05;
      colorRef.current = [
        cr + (tr - cr) * cs,
        cg + (tg - cg) * cs,
        cb + (tb - cb) * cs,
      ];
      const [r, g, b] = colorRef.current;
      const ri = r | 0; const gi = g | 0; const bi = b | 0;
      const colorSolid = `rgb(${ri},${gi},${bi})`;
      const colorAlpha = `rgba(${ri},${gi},${bi},0.45)`;

      const pct = Math.min(Math.max(displayRef.current / curMax, 0), 1);

      if (pct > 0.003) {
        const endDeg = START_DEG + SWEEP_DEG * pct;
        const dStr   = arc(START_DEG, endDeg, R);
        arcMainEl.setAttribute("d", dStr);
        arcMainEl.setAttribute("stroke", colorSolid);
        arcGlowEl.setAttribute("d", dStr);
        arcGlowEl.setAttribute("stroke", colorSolid);

        const tip = polar(endDeg, R);
        dotEl.setAttribute("cx", `${tip.x}`);
        dotEl.setAttribute("cy", `${tip.y}`);
        dotEl.setAttribute("fill", colorSolid);
        dotEl.setAttribute("opacity", "1");
      } else {
        arcMainEl.setAttribute("d", "");
        arcGlowEl.setAttribute("d", "");
        dotEl.setAttribute("opacity", "0");
      }

      // Progress ring
      const pp = Math.min(Math.max(curProg / 100, 0), 1);
      if (pp > 0.003) {
        progressArcEl.setAttribute("d", arc(START_DEG, START_DEG + SWEEP_DEG * pp, Rp));
        progressArcEl.setAttribute("stroke", colorAlpha);
      } else {
        progressArcEl.setAttribute("d", "");
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);
  // ↑ size is the only structural dep. All live data read via refs.

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      style={{ display: "block", overflow: "visible" }}
      aria-hidden="true"
    />
  );
}
