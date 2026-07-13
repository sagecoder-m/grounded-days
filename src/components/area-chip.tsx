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
          area === "personal" ? "var(--sage-soft)" : area === "professional" ? "var(--brown-soft)" : "var(--clay-soft)",
        color:
          area === "personal" ? "var(--sage-deep)" : area === "professional" ? "var(--brown)" : "var(--clay)",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor:
            area === "personal" ? "var(--sage)" : area === "professional" ? "var(--brown)" : "var(--clay)",
        }}
      />
      {m.label}
    </span>
  );
}

export function areaColor(area: Area) {
  return area === "personal" ? "var(--sage)" : area === "professional" ? "var(--brown)" : "var(--clay)";
}
