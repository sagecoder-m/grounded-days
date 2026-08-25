import type { Area } from "@/lib/store";
import { AREA_META } from "@/lib/store";
import { cn } from "@/lib/utils";

export function AreaChip({ area, className }: { area: Area; className?: string }) {
  const m = AREA_META[area];
  return (
    <span
      className={cn("chip", className)}
      style={{
        backgroundColor:
          area === "personal"
            ? "var(--sage-soft)"
            : area === "professional"
              ? "var(--brown-soft)"
              : "var(--clay-soft)",
        color:
          area === "personal"
            ? "var(--sage-deep)"
            : area === "professional"
              ? "var(--brown)"
              : "var(--clay)",
      }}
    >
      {/* The area's own mark rather than a dot, so the chip says which area it
          is without relying on three close earth tones to carry that alone.
          Inherits the chip's colour through currentColor. */}
      <m.icon className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
      {m.label}
    </span>
  );
}

export function areaColor(area: Area) {
  return area === "personal"
    ? "var(--sage)"
    : area === "professional"
      ? "var(--brown)"
      : "var(--clay)";
}
