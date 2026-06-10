interface ResultCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  note?: string;
}

export default function ResultCard({
  label,
  value,
  sub,
  icon,
  color,
  note,
}: ResultCardProps) {
  return (
    <div
      className="rounded-xl border bg-[#0F1219] p-5 flex flex-col gap-3 relative overflow-hidden"
      style={{ borderColor: `${color}22` }}
    >
      {/* Subtle corner glow */}
      <div
        className="absolute top-0 right-0 w-20 h-20 opacity-10 pointer-events-none"
        style={{
          background: `radial-gradient(circle at top right, ${color}, transparent)`,
        }}
      />

      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}15`, color }}
        >
          {icon}
        </div>
        <span className="text-xs text-[#4A5568] uppercase tracking-widest font-medium">
          {label}
        </span>
      </div>

      <div>
        <div
          className="font-display text-2xl font-bold leading-none"
          style={{ color, textShadow: `0 0 20px ${color}66` }}
        >
          {value}
        </div>
        {sub && (
          <div className="text-xs text-[#4A5568] mt-1">{sub}</div>
        )}
      </div>

      {note && (
        <div className="text-[10px] text-[#2D3748] leading-relaxed border-t border-[#1C2030] pt-2">
          {note}
        </div>
      )}
    </div>
  );
}
