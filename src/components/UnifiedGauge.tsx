"use client";

import { useEffect, useRef } from "react";

interface UnifiedGaugeProps {
  value: number;
  max: number;
  phase: "download" | "upload" | "idle";
  progress: number;
  size?: number;
}

const SCALE_MAX    = 1000;
const SCALE_LABELS = [0, 100, 250, 500, 750, 1000];
const START_DEG    = 225; // 7:30 (lower-left)
const SWEEP_DEG    = 270; // gap at bottom

const COLORS: Record<string, [number, number, number]> = {
  download: [0,   229, 255],
  upload:   [245, 158, 11 ],
  idle:     [40,  48,  70 ],
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
  if (n >= 315 || n <= 45) return "middle";
  if (n <= 135) return "start";
  if (n < 225)  return "middle";
  return "end";
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

    const cx  = size / 2;
    const cy  = size / 2;
    const R   = size * 0.34;
    const SW  = size * 0.052; // track/arc stroke-width

    const tickOutR   = R + size * 0.02;
    const tickMajInR = R - size * 0.055;
    const tickMinInR = R - size * 0.03;
    const labelR     = R + size * 0.10;

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
        <feGaussianBlur stdDeviation="2.5" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="ug_g2" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="8" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="ug_glow" x="-120%" y="-120%" width="340%" height="340%">
        <feGaussianBlur stdDeviation="14"/>
      </filter>
      <filter id="ug_numglow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="6" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <radialGradient id="ug_cap" cx="38%" cy="32%" r="65%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.22)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.85)"/>
      </radialGradient>
    `;
    svg.appendChild(defs);

    // ── Background track ──────────────────────────────────────────────────
    svg.appendChild(el("path", {
      d: arcD(cx, cy, START_DEG, SWEEP_DEG, R),
      fill: "none", stroke: "#0C0F1E",
      "stroke-width": SW,
      "stroke-linecap": "round",
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
        stroke: isMaj ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.10)",
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
        fill: "rgba(255,255,255,0.28)",
        "font-size": size * 0.044,
        "font-family": "ui-monospace, 'SF Mono', 'Courier New', monospace",
      });
      text.textContent = String(v);
      svg.appendChild(text);
    }

    // ── Active arc: wide soft glow (behind) ───────────────────────────────
    const arcGlowEl = el("path", {
      fill: "none", "stroke-width": SW * 2.2,
      "stroke-linecap": "round",
      filter: "url(#ug_glow)", opacity: "0.55",
    });
    svg.appendChild(arcGlowEl);

    // ── Active arc: main solid fill ────────────────────────────────────────
    const arcEl = el("path", {
      fill: "none", "stroke-width": SW,
      "stroke-linecap": "round",
      filter: "url(#ug_g1)",
    });
    svg.appendChild(arcEl);

    // ── Needle: glow layer ────────────────────────────────────────────────
    const needleGlEl = el("line", {
      x1: cx, y1: cy, x2: cx, y2: cy,
      "stroke-width": size * 0.018,
      "stroke-linecap": "round",
      filter: "url(#ug_g2)", opacity: "0.9",
    });
    svg.appendChild(needleGlEl);

    // ── Needle: sharp front ───────────────────────────────────────────────
    const needleEl = el("line", {
      x1: cx, y1: cy, x2: cx, y2: cy,
      "stroke-width": size * 0.005,
      "stroke-linecap": "round",
    });
    svg.appendChild(needleEl);

    // ── Needle tail (counterweight) ───────────────────────────────────────
    const tailEl = el("line", {
      x1: cx, y1: cy, x2: cx, y2: cy,
      "stroke-width": size * 0.012,
      "stroke-linecap": "round", opacity: "0.5",
    });
    svg.appendChild(tailEl);

    // ── Needle tip dot ────────────────────────────────────────────────────
    const tipEl = el("circle", { r: size * 0.014, filter: "url(#ug_g1)" });
    svg.appendChild(tipEl);

    // ── Center cap ────────────────────────────────────────────────────────
    svg.appendChild(el("circle", {
      cx, cy, r: size * 0.055,
      fill: "#090C1A",
      stroke: "rgba(255,255,255,0.10)",
      "stroke-width": 1.5,
    }));
    svg.appendChild(el("circle", {
      cx, cy, r: size * 0.033,
      fill: "url(#ug_cap)",
    }));

    // ── Speed number ──────────────────────────────────────────────────────
    const numEl = el("text", {
      x: cx, y: cy + size * 0.23,
      "text-anchor": "middle",
      "dominant-baseline": "auto",
      fill: "rgba(255,255,255,0.05)",
      "font-size": size * 0.185,
      "font-weight": "700",
      "font-family": "'Inter', 'SF Pro Display', 'Helvetica Neue', system-ui, sans-serif",
      "letter-spacing": "-0.02em",
    });
    numEl.textContent = "—";
    svg.appendChild(numEl);

    // ── Unit label ────────────────────────────────────────────────────────
    const unitEl = el("text", {
      x: cx, y: cy + size * 0.325,
      "text-anchor": "middle",
      "dominant-baseline": "auto",
      fill: "rgba(255,255,255,0.06)",
      "font-size": size * 0.05,
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

      // Color lerp
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
      const needLen = R * 0.84;
      const nx = cx + needLen * Math.cos(needRad);
      const ny = cy + needLen * Math.sin(needRad);

      // Counterweight tail
      const tailLen = R * 0.16;
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

      // Active arc — solid color, same width as track
      if (pct > 0.003) {
        const d = arcD(cx, cy, START_DEG, SWEEP_DEG * pct, R);
        arcEl.setAttribute("d", d);
        arcEl.setAttribute("stroke", solid);
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
        numEl.setAttribute("filter", "url(#ug_numglow)");
        unitEl.textContent = disp >= 1000 ? "GBPS" : "MBPS";
        unitEl.setAttribute("fill", `rgba(${ri},${gi},${bi},0.55)`);
      } else {
        numEl.textContent = "—";
        numEl.setAttribute("fill", "rgba(255,255,255,0.04)");
        numEl.removeAttribute("filter");
        unitEl.textContent = "MBPS";
        unitEl.setAttribute("fill", "rgba(255,255,255,0.04)");
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
