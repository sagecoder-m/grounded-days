import { cn } from "@/lib/utils";

export function SoftProgress({
  value,
  className,
  tint = "sage",
}: {
  value: number;
  className?: string;
  tint?: "sage" | "tan" | "clay" | "brown";
}) {
  const v = Math.max(0, Math.min(100, value));
  const bg =
    tint === "sage"
      ? "linear-gradient(90deg, var(--sage-deep), var(--sage))"
      : tint === "tan"
        ? "linear-gradient(90deg, oklch(0.70 0.035 82), var(--tan))"
        : tint === "clay"
          ? "linear-gradient(90deg, oklch(0.60 0.07 62), var(--clay))"
          : "linear-gradient(90deg, oklch(0.50 0.03 68), var(--brown))";
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${v}%`, backgroundImage: bg }}
      />
    </div>
  );
}
