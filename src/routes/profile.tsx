import { createFileRoute } from "@tanstack/react-router";
import { actions, useAppState, type AccentVariant, type Density, type CalView } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

const WIDGET_LABELS: Record<string, string> = {
  greeting: "Greeting & date",
  tasks: "Today's tasks",
  goals: "Area progress",
  chart: "Two-week rhythm chart",
  calendar: "Calendar",
  upcoming: "Upcoming",
};

const ACCENTS: { key: AccentVariant; label: string; swatch: string }[] = [
  { key: "sage", label: "Sage", swatch: "var(--sage)" },
  { key: "clay", label: "Clay", swatch: "var(--clay)" },
  { key: "brown", label: "Brown", swatch: "var(--brown)" },
  { key: "tan", label: "Tan", swatch: "var(--tan)" },
];

function ProfilePage() {
  const settings = useAppState().settings;

  function move(index: number, dir: -1 | 1) {
    const next = [...settings.widgets];
    const t = index + dir;
    if (t < 0 || t >= next.length) return;
    [next[index], next[t]] = [next[t], next[index]];
    actions.reorderWidgets(next);
  }

  return (
    <div className="space-y-10">
      <header>
        <p className="chip bg-secondary text-ink-soft">Profile</p>
        <h1 className="mt-3 font-serif text-4xl">Make it yours</h1>
        <p className="mt-2 text-ink-soft max-w-lg">Adjust the space so it feels comfortable. Nothing here is permanent.</p>
      </header>

      <section className="card-soft p-6 space-y-4">
        <h2 className="font-serif text-2xl">Display name</h2>
        <div className="space-y-1.5 max-w-sm">
          <Label htmlFor="dn">Used in your greeting</Label>
          <Input id="dn" value={settings.displayName} onChange={(e) => actions.updateSettings({ displayName: e.target.value })} placeholder="Your name" />
        </div>
      </section>

      <section className="card-soft p-6 space-y-5">
        <h2 className="font-serif text-2xl">Accent color</h2>
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.key}
              onClick={() => actions.updateSettings({ accent: a.key })}
              className={`flex items-center gap-2.5 rounded-full border px-4 py-2 transition-all ${settings.accent === a.key ? "border-ink" : "border-border hover:border-tan"}`}
            >
              <span className="h-4 w-4 rounded-full" style={{ backgroundColor: a.swatch }} />
              <span className="text-sm">{a.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card-soft p-6 space-y-4">
        <h2 className="font-serif text-2xl">Density</h2>
        <div className="flex gap-3">
          {(["comfy", "compact"] as Density[]).map((d) => (
            <button
              key={d}
              onClick={() => actions.updateSettings({ density: d })}
              className={`rounded-2xl border px-5 py-3 text-left transition-all flex-1 max-w-xs ${settings.density === d ? "border-primary bg-accent" : "border-border"}`}
            >
              <div className="font-medium capitalize">{d}</div>
              <div className="text-xs text-ink-soft mt-1">{d === "comfy" ? "More breathing room" : "Show a little more at once"}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="card-soft p-6 space-y-4">
        <h2 className="font-serif text-2xl">Default calendar view</h2>
        <div className="flex gap-2">
          {(["week", "month", "year"] as CalView[]).map((v) => (
            <button
              key={v}
              onClick={() => actions.updateSettings({ defaultCalView: v })}
              className={`chip capitalize ${settings.defaultCalView === v ? "bg-primary text-primary-foreground" : "bg-secondary text-ink-soft"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </section>

      <section className="card-soft p-6 space-y-4">
        <h2 className="font-serif text-2xl">Overview widgets</h2>
        <p className="text-sm text-ink-soft">Drag by the handle to re-order — or use the arrows. Switches control what appears.</p>
        <div className="space-y-2">
          {settings.widgets.map((w, i) => (
            <div
              key={w.key}
              draggable
              onDragStart={(e) => {
                setDragIndex(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragIndex === null || dragIndex === i) return;
                const next = [...settings.widgets];
                const [moved] = next.splice(dragIndex, 1);
                next.splice(i, 0, moved);
                setDragIndex(i);
                actions.reorderWidgets(next);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`flex items-center justify-between rounded-2xl border border-border bg-background px-4 py-3 transition-opacity ${dragIndex === i ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 cursor-grab active:cursor-grabbing text-ink-soft" aria-hidden />
                <div className="flex flex-col">
                  <button onClick={() => move(i, -1)} className="text-ink-soft hover:text-ink" aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button onClick={() => move(i, 1)} className="text-ink-soft hover:text-ink" aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                </div>
                <div>
                  <div className="text-sm font-medium">{WIDGET_LABELS[w.key] ?? w.key}</div>
                  <div className="text-[11px] text-ink-soft">Position {i + 1}</div>
                </div>
              </div>
              <Switch
                checked={w.enabled}
                onCheckedChange={(v) =>
                  actions.reorderWidgets(settings.widgets.map((x) => (x.key === w.key ? { ...x, enabled: v } : x)))
                }
              />
            </div>
          ))}
        </div>
      </section>


      <section className="card-soft p-6 space-y-3">
        <h2 className="font-serif text-2xl">Data</h2>
        <p className="text-sm text-ink-soft">Everything is stored on this device. Reset when you'd like a fresh start.</p>
        <Button
          variant="outline"
          className="rounded-full border-tan"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.localStorage.removeItem("grounded.v1");
              toast("Cleared. Refresh to seed fresh data.");
            }
          }}
        >
          Clear local data
        </Button>
      </section>
    </div>
  );
}
