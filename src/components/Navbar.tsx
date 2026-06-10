"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#090B10]/90 backdrop-blur-md border-b border-[#1C2030]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 rounded-full border-2 border-[#00E5FF] group-hover:glow-accent transition-all duration-300" />
              <div className="absolute inset-[6px] rounded-full bg-[#00E5FF] group-hover:scale-110 transition-transform duration-300" />
            </div>
            <span className="font-display text-lg text-white tracking-wider">
              NET<span className="text-[#00E5FF]">SPEED</span>
              <span className="text-[#4A5568]">.me</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="text-sm text-[#94A3B8] hover:text-[#00E5FF] transition-colors duration-200 tracking-wide"
            >
              Features
            </a>
            <a
              href="#tests"
              className="text-sm text-[#94A3B8] hover:text-[#00E5FF] transition-colors duration-200 tracking-wide"
            >
              Tests
            </a>
            <a
              href="#gaming"
              className="text-sm text-[#94A3B8] hover:text-[#00E5FF] transition-colors duration-200 tracking-wide"
            >
              Gaming
            </a>
            <button className="text-sm font-medium px-4 py-1.5 rounded border border-[#00E5FF] text-[#00E5FF] hover:bg-[#00E5FF] hover:text-[#090B10] transition-all duration-200 tracking-wide">
              Run Test
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-[#94A3B8] hover:text-[#00E5FF] transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <div className="w-5 flex flex-col gap-1.5">
              <span
                className={`h-px bg-current transition-all duration-200 ${
                  menuOpen ? "rotate-45 translate-y-2" : ""
                }`}
              />
              <span
                className={`h-px bg-current transition-all duration-200 ${
                  menuOpen ? "opacity-0" : ""
                }`}
              />
              <span
                className={`h-px bg-current transition-all duration-200 ${
                  menuOpen ? "-rotate-45 -translate-y-2" : ""
                }`}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden bg-[#0F1219]/95 backdrop-blur-md border-b border-[#1C2030]">
          <div className="px-4 py-4 flex flex-col gap-4">
            {["features", "tests", "gaming"].map((id) => (
              <a
                key={id}
                href={`#${id}`}
                className="text-sm text-[#94A3B8] hover:text-[#00E5FF] transition-colors capitalize tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                {id}
              </a>
            ))}
            <button className="text-sm font-medium px-4 py-2 rounded border border-[#00E5FF] text-[#00E5FF] hover:bg-[#00E5FF] hover:text-[#090B10] transition-all w-fit">
              Run Test
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
