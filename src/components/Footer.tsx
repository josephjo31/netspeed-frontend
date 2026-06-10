export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[#1C2030] bg-[#090B10]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="relative w-7 h-7">
                <div className="absolute inset-0 rounded-full border-2 border-[#00E5FF]" />
                <div className="absolute inset-[5px] rounded-full bg-[#00E5FF]" />
              </div>
              <span className="font-display text-base text-white tracking-wider">
                NET<span className="text-[#00E5FF]">SPEED</span>
                <span className="text-[#4A5568]">.me</span>
              </span>
            </div>
            <p className="text-xs text-[#4A5568] leading-relaxed max-w-[200px]">
              Internet & Gaming Network Analyzer. Built for everyone who
              demands more from their connection.
            </p>
          </div>

          {/* Tests */}
          <div>
            <h4 className="font-display text-[10px] tracking-[0.2em] text-[#00E5FF] uppercase mb-4">
              Tests
            </h4>
            <ul className="space-y-2.5">
              {[
                "Normal Speed Test",
                "Gaming Ping Test",
                "Jitter Check",
                "Packet Loss Test",
                "ISP Lookup",
              ].map((item) => (
                <li key={item}>
                  <a
                    href="#tests"
                    className="text-sm text-[#4A5568] hover:text-[#94A3B8] transition-colors"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Games */}
          <div>
            <h4 className="font-display text-[10px] tracking-[0.2em] text-[#A3FF47] uppercase mb-4">
              Games
            </h4>
            <ul className="space-y-2.5">
              {[
                "CS2",
                "Valorant",
                "Rocket League",
                "PUBG",
                "Fortnite",
              ].map((item) => (
                <li key={item}>
                  <a
                    href="#tests"
                    className="text-sm text-[#4A5568] hover:text-[#94A3B8] transition-colors"
                  >
                    {item} Ping
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-display text-[10px] tracking-[0.2em] text-[#4A5568] uppercase mb-4">
              Company
            </h4>
            <ul className="space-y-2.5">
              {["About", "Privacy Policy", "Terms of Service", "Contact"].map(
                (item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-sm text-[#4A5568] hover:text-[#94A3B8] transition-colors"
                    >
                      {item}
                    </a>
                  </li>
                )
              )}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-[#1C2030] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#2D3748]">
            © {year} NetSpeed.me — All rights reserved.
          </p>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A3FF47] animate-pulse" />
            <span className="text-xs text-[#2D3748]">
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
