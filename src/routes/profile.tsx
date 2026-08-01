import { createFileRoute } from "@tanstack/react-router";
import {
  actions,
  deleteAllUserData,
  useAppState,
  type AccentVariant,
  type CalView,
  type Density,
  type Settings,
} from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

  return (
    <div className="space-y-10">
      <header>
        <p className="chip bg-secondary text-ink-soft">Profile</p>
        <h1 className="mt-3 font-serif text-4xl">Make it yours</h1>
        <p className="mt-2 text-ink-soft max-w-lg">
          Adjust the space so it feels comfortable. Nothing here is permanent.
        </p>
      </header>

      <DisplayNameSection value={settings.displayName} />

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
              <div className="text-xs text-ink-soft mt-1">
                {d === "comfy" ? "More breathing room" : "Show a little more at once"}
              </div>
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

      <WidgetSection widgets={settings.widgets} />


      <DataSection />
    </div>
  );
}

/**
 * Display name types into local state and writes on a debounce. Writing per
 * keystroke to a network-backed store drops characters as responses land out of
 * order.
 */
function DisplayNameSection({ value }: { value: string }) {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);

  // Adopt server changes only while the field is untouched.
  useEffect(() => {
    if (!dirty.current) setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!dirty.current) return;
    if (draft === value) return;
    const timer = window.setTimeout(() => {
      actions.updateSettings({ displayName: draft });
      dirty.current = false;
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft, value]);

  return (
    <section className="card-soft p-6 space-y-4">
      <h2 className="font-serif text-2xl">Display name</h2>
      <div className="space-y-1.5 max-w-sm">
        <Label htmlFor="dn">Used in your greeting</Label>
        <Input
          id="dn"
          value={draft}
          onChange={(e) => {
            dirty.current = true;
            setDraft(e.target.value);
          }}
          placeholder="Your name"
        />
      </div>
    </section>
  );
}

/**
 * Widget order is held locally for the duration of a drag and committed once on
 * drop. The old version wrote on every onDragOver, which with async writes
 * meant each move recomputed from a stale array and scrambled the list.
 */
function WidgetSection({ widgets }: { widgets: Settings["widgets"] }) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [working, setWorking] = useState<Settings["widgets"] | null>(null);
  const shown = working ?? widgets;

  function commit(next: Settings["widgets"]) {
    setWorking(null);
    setDragIndex(null);
    actions.reorderWidgets(next);
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...shown];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    actions.reorderWidgets(next);
  }

  return (
    <section className="card-soft p-6 space-y-4">
      <h2 className="font-serif text-2xl">Overview widgets</h2>
      <p className="text-sm text-ink-soft">
        Drag by the handle to re-order — or use the arrows. Switches control what appears.
      </p>
      <div className="space-y-2">
        {shown.map((w, i) => (
          <div
            key={w.key}
            draggable
            onDragStart={(e) => {
              setDragIndex(i);
              setWorking([...shown]);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragIndex === null || dragIndex === i) return;
              const next = [...shown];
              const [moved] = next.splice(dragIndex, 1);
              next.splice(i, 0, moved);
              setDragIndex(i);
              setWorking(next);
            }}
            onDragEnd={() => commit(shown)}
            className={`flex items-center justify-between rounded-2xl border border-border bg-background px-4 py-3 transition-opacity ${dragIndex === i ? "opacity-50" : ""}`}
          >
            <div className="flex items-center gap-3">
              <GripVertical
                className="h-4 w-4 cursor-grab active:cursor-grabbing text-ink-soft"
                aria-hidden
              />
              <div className="flex flex-col">
                <button
                  onClick={() => move(i, -1)}
                  className="text-ink-soft hover:text-ink"
                  aria-label="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  className="text-ink-soft hover:text-ink"
                  aria-label="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <div>
                <div className="text-sm font-medium">{WIDGET_LABELS[w.key] ?? w.key}</div>
                <div className="text-[11px] text-ink-soft">Position {i + 1}</div>
              </div>
            </div>
            <Switch
              checked={w.enabled}
              onCheckedChange={(v) =>
                actions.reorderWidgets(
                  shown.map((x) => (x.key === w.key ? { ...x, enabled: v } : x)),
                )
              }
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Bulk delete. Replaces the old "clear local data" button, which cleared a
 *  localStorage key that no longer backs anything. */
function DataSection() {
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);
    try {
      await deleteAllUserData();
      toast("Cleared. A fresh start whenever you're ready.");
    } catch (err) {
      toast.error("Couldn't clear everything", {
        description: err instanceof Error ? err.message : "Some data may remain.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card-soft p-6 space-y-3">
      <h2 className="font-serif text-2xl">Data</h2>
      <p className="text-sm text-ink-soft">
        Everything is saved to your account, so it follows you between devices. If you'd like a
        blank slate, you can clear it all.
      </p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="rounded-full border-tan" disabled={busy}>
            {busy ? "Clearing…" : "Clear all my data"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl">Clear everything?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes your tasks, habits, goals, projects, events, focus history, and
              preferences from your account. It can't be undone — your sign-in and passcode stay as
              they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Keep my data</AlertDialogCancel>
            <AlertDialogAction className="rounded-full" onClick={() => void reset()}>
              Yes, clear it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
