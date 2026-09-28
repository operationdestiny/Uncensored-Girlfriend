import { Sparkle } from "lucide-react";

export function MemoryBadge({ label = "Ever Memory™" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-bond-gold/25 bg-bond-gold/10 px-3 py-1 text-xs font-semibold text-bond-gold">
      <Sparkle size={13} />
      {label}
    </span>
  );
}
