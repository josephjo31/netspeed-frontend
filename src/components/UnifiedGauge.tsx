"use client";

import { useEffect, useRef } from "react";

interface UnifiedGaugeProps {
  value: number;
  max: number;
  phase: "download" | "upload" | "idle";
  progress: number;
  size?: number;
}

const SCALE_MAX  = 1000;
const SCALE_LABELS = [0, 100, 250, 500, 750, 1000];
const START_DEG  = 225; // 7:30 position (lower-left)
const SWEEP_DEG  = 270; // gap at the bottom

const COLORS: Record<string, [number, number, number]> = {
  download: [0,   229, 255],  // cyan
  upload:   [245, 158, 11 ],  // amber
  idle:     [40,  48,  70 ],  // dark gray
};

function toRad(deg: number) {
  return ((deg - 90) * Math.PI) / 180;
}

function pt(cx: number, cy: number, deg: number, r: number) {
  return { x: cx + r * Math.cos(toRad(deg)), y: cy + r * Math.sin(toRad(deg)) };
}

function arcD(cx: number, cy: number, startDeg: number, sweepDeg: number, r: number) {
  if (sweepDeg < 0.1) return "";
  const s  = pt(cx, cy, startDeg, r);
  const e  = pt(cx, cy, startDeg + sweepDeg, r);
  const lg = sweepDeg > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${lg} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

function labelAnchor(deg: number): string {
  const n = ((deg % 360) + 360) % 360;
  if (n >= 315 || n <= 45) return "middle"; // top
  if (n <= 135) return "start";             // right quadrant
  if (n < 225)  return "middle";            // bottom
  return "end";                             // left quadrant
}

export default function UnifiedGauge({
  value,
  phase,
  size = 300,
}: UnifiedGaugeProps) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const animRef = useRef<number>(0);

  const valueRef = useRef(value);
  const phaseRef = useRef(phase);
  valueRef.current = value;
  phaseRef.current = phase;

  const displayRef = useRef(0);
  const colorRef   = useRef<[number, number, number]>([40, 48, 70]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const cx = size / 2;
    const cy = size / 2;
    const R  = size * 0.327;

    const tickOutR   = R + size * 0.018;
    const tickMajInR = R - size * 0.052;
    const tickMinInR = R - size * 0.028;
    const labelR     = R + size * 0.092;

    const ns = "http://www.w3.org/2000/svg";
    const el = (tag: string, a: Record<string, string | number> = {}) => {
      const e = document.createElementNS(ns, tag);
      Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v)));
      return e;
    };

    svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);

    // ── Defs ──────────────────────────────────────────────────────────────
    const defs = el("defs");
    defs.innerHTML = `
      <filter id="ug_g1" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="ug_g2" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="9" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="ug_soft" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="18"/>
      </filter>
      <radialGradient id="ug_cap" cx="38%" cy="32%" r="65%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.20)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.80)"/>
      </radialGradient>
    `;
    svg.appendChild(defs);

    // ── Background track ──────────────────────────────────────────────────
    svg.appendChild(el("path", {
      d: arcD(cx, cy, START_DEG, SWEEP_DEG, R),
      fill: "none", stroke: "#0B0E1B",
      "stroke-width": size * 0.068,
      "stroke-linecap": "round",
    }));

    // Subtle inner rim highlight
    svg.appendChild(el("path", {
      d: arcD(cx, cy, START_DEG, SWEEP_DEG, R - size * 0.025),
      fill: "none", stroke: "rgba(255,255,255,0.03)",
      "stroke-width": 1, "stroke-linecap": "round",
    }));

    // ── Tick marks ────────────────────────────────────────────────────────
    const majorSet = new Set(SCALE_LABELS);
    for (let v = 0; v <= SCALE_MAX; v += 50) {
      const isMaj = majorSet.has(v);
      const deg   = START_DEG + (v / SCALE_MAX) * SWEEP_DEG;
      const inner = pt(cx, cy, deg, isMaj ? tickMajInR : tickMinInR);
      const outer = pt(cx, cy, deg, tickOutR);
      svg.appendChild(el("line", {
        x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y,
        stroke: isMaj ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.09)",
        "stroke-width": isMaj ? 1.5 : 0.8,
        "stroke-linecap": "round",
      }));
    }

    // ── Scale labels ──────────────────────────────────────────────────────
    for (const v of SCALE_LABELS) {
      const deg  = START_DEG + (v / SCALE_MAX) * SWEEP_DEG;
      const p    = pt(cx, cy, deg, labelR);
      const text = el("text", {
        x: p.x, y: p.y,
        "text-anchor": labelAnchor(deg),
        "dominant-baseline": "middle",
        fill: "rgba(255,255,255,0.24)",
        "font-size": size * 0.042,
        "font-family": "ui-monospace, 'SF Mono', 'Courier New', monospace",
      });
      text.textContent = String(v);
      svg.appendChild(text);
    }

    // ── Active arc (blurred wide glow behind) ─────────────────────────────
    const arcGlowEl = el("path", {
      fill: "none", "stroke-width": size * 0.07,
      "stroke-linecap": "round",
      filter: "url(#ug_soft)", opacity: "0.45",
    });
    svg.appendChild(arcGlowEl);

    // ── Active arc (main colored stroke) ──────────────────────────────────
    const arcEl = el("path", {
      fill: "none", "stroke-width": size * 0.026,
      "stroke-linecap": "round",
      filter: "url(#ug_g1)",
    });
    svg.appendChild(arcEl);

    // ── Needle: counterweight tail stub ───────────────────────────────────
    const tailEl = el("line", {
      x1: cx, y1: cy, x2: cx, y2: cy,
      "stroke-width": size * 0.013,
      "stroke-linecap": "round", opacity: "0.55",
    });
    svg.appendChild(tailEl);

    // ── Needle: wide glow layer ───────────────────────────────────────────
    const needleGlEl = el("line", {
      x1: cx, y1: cy, x2: cx, y2: cy,
      "stroke-width": size * 0.02,
      "stroke-linecap": "round",
      filter: "url(#ug_g2)", opacity: "0.85",
    });
    svg.appendChild(needleGlEl);

    // ── Needle: sharp front layer ──────────────────────────────────────────
    const needleEl = el("line", {
      x1: cx, y1: cy, x2: cx, y2: cy,
      "stroke-width": size * 0.006,
      "stroke-linecap": "round",
    });
    svg.appendChild(needleEl);

    // ── Needle tip dot ────────────────────────────────────────────────────
    const tipEl = el("circle", { r: size * 0.016, filter: "url(#ug_g1)" });
    svg.appendChild(tipEl);

    // ── Center cap ────────────────────────────────────────────────────────
    svg.appendChild(el("circle", {
      cx, cy, r: size * 0.058,
      fill: "#0A0D18",
      stroke: "rgba(255,255,255,0.09)",
      "stroke-width": 1.5,
    }));
    svg.appendChild(el("circle", {
      cx, cy, r: size * 0.036,
      fill: "url(#ug_cap)",
    }));

    // ── Speed number (updated each frame) ─────────────────────────────────
    const numEl = el("text", {
      x: cx, y: cy + size * 0.22,
      "text-anchor": "middle",
      "dominant-baseline": "auto",
      fill: "rgba(255,255,255,0.06)",
      "font-size": size * 0.162,
      "font-weight": "700",
      "font-family": "'Inter', 'SF Pro Display', 'Helvetica Neue', system-ui, sans-serif",
      "letter-spacing": "-0.02em",
    });
    numEl.textContent = "—";
    svg.appendChild(numEl);

    // ── Unit label ────────────────────────────────────────────────────────
    const unitEl = el("text", {
      x: cx, y: cy + size * 0.315,
      "text-anchor": "middle",
      "dominant-baseline": "auto",
      fill: "rgba(255,255,255,0.08)",
      "font-size": size * 0.048,
      "font-weight": "500",
      "font-family": "ui-monospace, monospace",
      "letter-spacing": "0.18em",
    });
    unitEl.textContent = "MBPS";
    svg.appendChild(unitEl);

    // ── rAF loop ──────────────────────────────────────────────────────────
    const draw = () => {
      const curPhase = phaseRef.current;
      const target   = Math.min(Math.max(valueRef.current, 0), SCALE_MAX);
      const lerp     = curPhase === "idle" ? 0.04 : 0.09;

      displayRef.current += (target - displayRef.current) * lerp;
      const disp = displayRef.current;

      // Smooth color
      const [tr, tg, tb] = COLORS[curPhase] ?? COLORS.idle;
      const [cr, cg, cb] = colorRef.current;
      const cs = 0.05;
      colorRef.current = [
        cr + (tr - cr) * cs,
        cg + (tg - cg) * cs,
        cb + (tb - cb) * cs,
      ];
      const [r, g, b] = colorRef.current;
      const ri = r | 0; const gi = g | 0; const bi = b | 0;
      const solid = `rgb(${ri},${gi},${bi})`;

      const pct     = Math.min(disp / SCALE_MAX, 1);
      const needDeg = START_DEG + SWEEP_DEG * pct;
      const needRad = toRad(needDeg);
      const needLen = R * 0.82;
      const nx      = cx + needLen * Math.cos(needRad);
      const ny      = cy + needLen * Math.sin(needRad);

      // Counterweight tail (opposite direction)
      const tailLen = R * 0.17;
      const tx = cx - tailLen * Math.cos(needRad);
      const ty = cy - tailLen * Math.sin(needRad);

      [needleEl, needleGlEl].forEach(n => {
        n.setAttribute("x1", String(tx)); n.setAttribute("y1", String(ty));
        n.setAttribute("x2", String(nx)); n.setAttribute("y2", String(ny));
        n.setAttribute("stroke", solid);
      });
      tailEl.setAttribute("x1", String(tx)); tailEl.setAttribute("y1", String(ty));
      tailEl.setAttribute("x2", String(cx)); tailEl.setAttribute("y2", String(cy));
      tailEl.setAttribute("stroke", solid);
      tipEl.setAttribute("cx", String(nx));
      tipEl.setAttribute("cy", String(ny));
      tipEl.setAttribute("fill", solid);

      // Active arc fill
      if (pct > 0.003) {
        const d = arcD(cx, cy, START_DEG, SWEEP_DEG * pct, R);
        arcEl.setAttribute("d", d);
        arcEl.setAttribute("stroke", `rgba(${ri},${gi},${bi},0.5)`);
        arcGlowEl.setAttribute("d", d);
        arcGlowEl.setAttribute("stroke", solid);
      } else {
        arcEl.setAttribute("d", "");
        arcGlowEl.setAttribute("d", "");
      }

      // Speed number
      const isSpeed = curPhase !== "idle";
      if (isSpeed && disp > 0.5) {
        const shown = disp >= 1000
          ? (disp / 1000).toFixed(2)
          : disp >= 100
          ? disp.toFixed(0)
          : disp.toFixed(1);
        numEl.textContent = shown;
        numEl.setAttribute("fill", solid);
        numEl.setAttribute("filter", "url(#ug_g1)");
        unitEl.textContent = disp >= 1000 ? "GBPS" : "MBPS";
        unitEl.setAttribute("fill", `rgba(${ri},${gi},${bi},0.5)`);
      } else {
        numEl.textContent = "—";
        numEl.setAttribute("fill", "rgba(255,255,255,0.05)");
        numEl.removeAttribute("filter");
        unitEl.textContent = "MBPS";
        unitEl.setAttribute("fill", "rgba(255,255,255,0.05)");
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

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
