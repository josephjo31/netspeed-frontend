const features = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={1.5}>
        <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: "Instant Results",
    desc: "Full diagnostic in under 30 seconds. No signups, no installs, no friction.",
    color: "#00E5FF",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
      </svg>
    ),
    title: "Global Server Network",
    desc: "Hundreds of test nodes worldwide. Always connect to the closest, fastest server.",
    color: "#00E5FF",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={1.5}>
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    title: "Historical Tracking",
    desc: "Save and compare results over time. Spot degradation before it affects you.",
    color: "#00E5FF",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={1.5}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    title: "Privacy First",
    desc: "No tracking, no selling your data. Your results are yours. Period.",
    color: "#A3FF47",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={1.5}>
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
        <line x1="12" y1="18" x2="12.01" y2="18"/>
      </svg>
    ),
    title: "Mobile Optimized",
    desc: "Full testing suite on any device. Works flawlessly on 4G, 5G, and Wi-Fi.",
    color: "#A3FF47",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
    title: "ISP Intelligence",
    desc: "Automatic provider detection and routing info. Know who you're dealing with.",
    color: "#A3FF47",
  },
];

export default function Features() {
  return (
    <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 relative">
      {/* Subtle divider */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-16 bg-gradient-to-b from-transparent via-[#1C2030] to-transparent" />

      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="font-display text-xs tracking-[0.3em] text-[#A3FF47] uppercase mb-3">
            Why NetSpeed.me
          </p>
          <h2 className="text-3xl sm:text-4xl font-semibold text-white">
            Built different.
          </h2>
          <p className="mt-4 text-[#94A3B8] max-w-lg mx-auto">
            We obsess over accuracy, speed, and usability so you can focus on
            what matters — knowing your network.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#1C2030] rounded-2xl overflow-hidden">
          {features.map(({ icon, title, desc, color }) => (
            <div
              key={title}
              className="bg-[#090B10] p-8 group hover:bg-[#0F1219] transition-colors duration-200"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-5 transition-all duration-200"
                style={{
                  background: `rgba(${color === "#00E5FF" ? "0,229,255" : "163,255,71"},0.08)`,
                  color,
                }}
              >
                {icon}
              </div>
              <h3 className="text-white font-semibold mb-2">{title}</h3>
              <p className="text-sm text-[#4A5568] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Bottom CTA strip */}
        <div
          className="mt-12 rounded-2xl p-8 border border-[#1C2030] bg-[#0F1219] flex flex-col sm:flex-row items-center justify-between gap-6"
          style={{
            background:
              "linear-gradient(135deg, #0F1219 0%, rgba(0,229,255,0.04) 100%)",
          }}
        >
          <div>
            <h3 className="text-white font-semibold text-lg">
              Ready to see your real speeds?
            </h3>
            <p className="text-[#4A5568] text-sm mt-1">
              Takes 30 seconds. No account needed.
            </p>
          </div>
          <a href="#tests">
            <button className="flex-shrink-0 px-8 py-3 rounded-xl bg-[#00E5FF] text-[#090B10] font-semibold text-sm tracking-wide hover:bg-white transition-all duration-200 glow-accent">
              Start Free Test →
            </button>
          </a>
        </div>
      </div>
    </section>
  );
}
