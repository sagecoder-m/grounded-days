import { createFileRoute, Link } from "@tanstack/react-router";
import {
  actions,
  deleteAllUserData,
  useAppState,
  type AccentVariant,
  type CalView,
  type Density,
  type AssistantLength,
  type AssistantTone,
  type NavLayout,
  type Settings,
  type Theme,
  type WeekStart,
} from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { PasscodeSettings } from "@/components/passcode-settings";
import { useIsAdmin } from "@/lib/use-is-admin";
import { CalendarConnectionsSection } from "@/components/calendar-connections";
import { ShareLinksSection } from "@/components/share-links";
import {
  Bot,
  CalendarDays,
  Monitor,
  Moon,
  Palette,
  Sun,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

const THEMES: { key: Theme; label: string; hint: string; icon: LucideIcon }[] = [
  {
    key: "system",
    label: "Follow my device",
    hint: "Changes when your device does",
    icon: Monitor,
  },
  { key: "light", label: "Light", hint: "Cream, always", icon: Sun },
  { key: "dark", label: "Dark", hint: "Easier at night", icon: Moon },
];

const NAV_LAYOUTS: { key: NavLayout; label: string; hint: string }[] = [
  { key: "sidebar", label: "Side rail", hint: "Tabs down the left, collapsible to icons" },
  { key: "top", label: "Top tabs", hint: "Tabs across the top, wider page" },
];

/** Monday first is the ISO week and the default. Saturday is offered because it
 *  is the convention across much of the Middle East, not as a novelty. */
const WEEK_STARTS: { key: WeekStart; label: string }[] = [
  { key: 1, label: "Monday" },
  { key: 0, label: "Sunday" },
  { key: 6, label: "Saturday" },
];

const TONES: { key: AssistantTone; label: string; hint: string }[] = [
  { key: "gentle", label: "Gentle", hint: "Warm, encouraging, never blunt" },
  { key: "neutral", label: "Neutral", hint: "Plain and matter-of-fact" },
  { key: "direct", label: "Direct", hint: "Straight to the point, no cushioning" },
];

const LENGTHS: { key: AssistantLength; label: string; hint: string }[] = [
  { key: "brief", label: "Brief", hint: "A couple of sentences" },
  { key: "balanced", label: "Balanced", hint: "A short paragraph or two" },
  { key: "thorough", label: "Thorough", hint: "Fuller explanations when useful" },
];

const ACCENTS: { key: AccentVariant; label: string; swatch: string }[] = [
  { key: "sage", label: "Sage", swatch: "var(--sage)" },
  { key: "clay", label: "Clay", swatch: "var(--clay)" },
  { key: "brown", label: "Brown", swatch: "var(--brown)" },
  { key: "tan", label: "Tan", swatch: "var(--tan)" },
];

/**
 * Only rendered for the HQ account — everyone else's Profile has no admin tab
 * and no hint one exists. The hook's query returns their own admin_users row
 * or nothing; the portal itself re-checks server-side.
 */
function AdminSection() {
  const { isAdmin } = useIsAdmin();
  if (!isAdmin) return null;
  return (
    <section className="card-soft flex flex-wrap items-center justify-between gap-3 p-6">
      <div>
        <h2 className="font-serif text-lg">Admin</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Pilot dashboard — usage, errors, and tester accounts.
        </p>
      </div>
      <Link
        to="/admin"
        className="rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground"
      >
        Open HQ
      </Link>
    </section>
  );
}

type ProfileTab = "profile" | "appearance" | "calendar" | "assistant";

const PROFILE_TABS: { key: ProfileTab; label: string; icon: LucideIcon }[] = [
  { key: "profile", label: "Profile", icon: UserRound },
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "assistant", label: "Assistant", icon: Bot },
];

function ProfilePage() {
  const settings = useAppState().settings;
  const [tab, setTab] = useState<ProfileTab>("profile");

  return (
    <div className="space-y-10">
      <header>
        <p className="chip bg-secondary text-ink-soft">Profile</p>
        <h1 className="mt-3 font-serif text-2xl md:text-3xl">Make it yours</h1>
        <p className="mt-2 text-ink-soft max-w-lg">
          Adjust the space so it feels comfortable. Nothing here is permanent.
        </p>
      </header>

      <AdminSection />

      {/*
        The rail sits on the right on a wide screen, mirroring the app's own
        left-hand side rail — same rounded pill, same tinted active state, same
        accent bar — just facing the other way, since it sits beside content
        rather than beside the window edge. On a phone there's no side to put
        it on, so it becomes a horizontal scroll of the same chips, above the
        section it controls rather than beside it.
      */}
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
        <ProfileTabRail active={tab} onSelect={setTab} className="order-1 md:order-2" />

        <div className="order-2 min-w-0 flex-1 space-y-10 md:order-1">
          {tab === "profile" && (
            <>
              <DisplayNameSection value={settings.displayName} />
              <PasscodeSettings />
              <DataSection />
              <ShareLinksSection />
              <PrivacyTermsSection />
            </>
          )}

          {tab === "appearance" && (
            <>
              <ThemeSection theme={settings.theme} />
              <AccentSection accent={settings.accent} />
              <NavigationSection navLayout={settings.navLayout} />
              <DensitySection density={settings.density} />
            </>
          )}

          {tab === "calendar" && (
            <>
              <CalendarConnectionsSection />
              <DefaultCalendarViewSection defaultCalView={settings.defaultCalView} />
              <WeekStartsOnSection weekStartsOn={settings.weekStartsOn} />
            </>
          )}

          {tab === "assistant" && <AssistantSection settings={settings} />}
        </div>
      </div>
    </div>
  );
}

/**
 * The tab rail. Visually the app's left-hand side rail, turned to face the
 * other way: same rounded item, same tinted background and accent bar on the
 * active one, same icon-plus-label row. It only ever holds these four
 * sections, so unlike the real rail there's nothing to collapse to icons.
 */
function ProfileTabRail({
  active,
  onSelect,
  className = "",
}: {
  active: ProfileTab;
  onSelect: (tab: ProfileTab) => void;
  className?: string;
}) {
  return (
    <nav
      aria-label="Profile sections"
      className={`flex gap-2 overflow-x-auto pb-1 md:sticky md:top-6 md:w-48 md:shrink-0 md:flex-col md:gap-0.5 md:overflow-visible md:pb-0 ${className}`}
    >
      {PROFILE_TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onSelect(t.key)}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors md:w-full md:shrink ${
              isActive ? "font-medium text-ink" : "text-ink-soft hover:bg-secondary hover:text-ink"
            }`}
            style={
              isActive
                ? { backgroundColor: "color-mix(in oklab, var(--primary) 12%, transparent)" }
                : undefined
            }
          >
            {isActive && (
              <span
                aria-hidden
                className="absolute right-0 top-1/2 hidden h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary md:block"
              />
            )}
            <t.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
            <span className="whitespace-nowrap">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function ThemeSection({ theme }: { theme: Theme }) {
  return (
    <section className="card-soft p-6 space-y-4">
      <h2 className="font-serif text-lg">Light or dark</h2>
      {/* The quick switch lives beside the lock in the sidebar, which is where
          it gets used. This is here for the third option: "system" cannot be
          reached by a two-state toggle, and it is the one worth keeping, since
          it follows a device that already dims itself in the evening. */}
      <p className="text-sm text-ink-soft">
        There&rsquo;s a quicker switch next to Lock. This is where you can hand the choice back to
        your device.
      </p>
      <div className="flex flex-wrap gap-3">
        {THEMES.map((t) => (
          <button
            key={t.key}
            onClick={() => actions.updateSettings({ theme: t.key })}
            className={`flex-1 max-w-xs rounded-2xl border px-5 py-3 text-left transition-all ${
              theme === t.key ? "border-primary bg-accent" : "border-border"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <t.icon className="h-4 w-4" /> {t.label}
            </div>
            <div className="mt-1 text-xs text-ink-soft">{t.hint}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function AccentSection({ accent }: { accent: AccentVariant }) {
  return (
    <section className="card-soft p-6 space-y-5">
      <h2 className="font-serif text-lg">Accent color</h2>
      <div className="flex flex-wrap gap-3">
        {ACCENTS.map((a) => (
          <button
            key={a.key}
            onClick={() => actions.updateSettings({ accent: a.key })}
            className={`flex items-center gap-2.5 rounded-full border px-4 py-2 transition-all ${accent === a.key ? "border-ink" : "border-border hover:border-tan"}`}
          >
            <span className="h-4 w-4 rounded-full" style={{ backgroundColor: a.swatch }} />
            <span className="text-sm">{a.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function NavigationSection({ navLayout }: { navLayout: NavLayout }) {
  return (
    <section className="card-soft p-6 space-y-4">
      <h2 className="font-serif text-lg">Navigation</h2>
      <p className="text-sm text-ink-soft">
        Where the tabs live on a wide screen. Phones always use the top bar.
      </p>
      <div className="flex flex-wrap gap-3">
        {NAV_LAYOUTS.map((layout) => (
          <button
            key={layout.key}
            onClick={() => actions.updateSettings({ navLayout: layout.key })}
            className={`flex-1 max-w-xs rounded-2xl border px-5 py-3 text-left transition-all ${
              navLayout === layout.key ? "border-primary bg-accent" : "border-border"
            }`}
          >
            <div className="font-medium">{layout.label}</div>
            <div className="mt-1 text-xs text-ink-soft">{layout.hint}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function DensitySection({ density }: { density: Density }) {
  return (
    <section className="card-soft p-6 space-y-4">
      <h2 className="font-serif text-lg">Density</h2>
      <div className="flex gap-3">
        {(["comfy", "compact"] as Density[]).map((d) => (
          <button
            key={d}
            onClick={() => actions.updateSettings({ density: d })}
            className={`rounded-2xl border px-5 py-3 text-left transition-all flex-1 max-w-xs ${density === d ? "border-primary bg-accent" : "border-border"}`}
          >
            <div className="font-medium capitalize">{d}</div>
            <div className="text-xs text-ink-soft mt-1">
              {d === "comfy" ? "More breathing room" : "Show a little more at once"}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function DefaultCalendarViewSection({ defaultCalView }: { defaultCalView: CalView }) {
  return (
    <section className="card-soft p-6 space-y-4">
      <h2 className="font-serif text-lg">Default calendar view</h2>
      <div className="flex gap-2">
        {(["week", "month", "year"] as CalView[]).map((v) => (
          <button
            key={v}
            onClick={() => actions.updateSettings({ defaultCalView: v })}
            className={`chip capitalize ${defaultCalView === v ? "bg-primary text-primary-foreground" : "bg-secondary text-ink-soft"}`}
          >
            {v}
          </button>
        ))}
      </div>
    </section>
  );
}

function WeekStartsOnSection({ weekStartsOn }: { weekStartsOn: WeekStart }) {
  return (
    <section className="card-soft p-6 space-y-4">
      <h2 className="font-serif text-lg">Week starts on</h2>
      <p className="text-sm text-ink-soft">
        Sets the first column of the habit grid and the first day of the week on the calendar.
      </p>
      <div className="flex gap-2">
        {WEEK_STARTS.map((w) => (
          <button
            key={w.key}
            onClick={() => actions.updateSettings({ weekStartsOn: w.key })}
            className={`chip ${
              weekStartsOn === w.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-ink-soft"
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>
    </section>
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
      <h2 className="font-serif text-lg">Display name</h2>
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
/**
 * The client's brief for the assistant.
 *
 * Asked rather than inferred. Guessing someone's preferred tone from how they
 * use the app would be both less accurate — the app cannot see why a week was
 * slow — and a quiet widening of what the assistant knows about them. This keeps
 * the person in charge of their own instructions.
 */
function AssistantSection({ settings }: { settings: Settings }) {
  const [notes, setNotes] = useState(settings.assistantNotes);
  const dirty = notes !== settings.assistantNotes;

  return (
    <section className="card-soft space-y-5 p-6">
      <div>
        <h2 className="font-serif text-lg">Your assistant</h2>
        <p className="mt-1 text-sm text-ink-soft">
          How it should talk to you. It already sees your goals, tasks, habits and schedule — never
          your journal.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Tone</Label>
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <button
              key={t.key}
              onClick={() => actions.updateSettings({ assistantTone: t.key })}
              title={t.hint}
              className={`chip ${
                settings.assistantTone === t.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-ink-soft"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Reply length</Label>
        <div className="flex flex-wrap gap-2">
          {LENGTHS.map((l) => (
            <button
              key={l.key}
              onClick={() => actions.updateSettings({ assistantLength: l.key })}
              title={l.hint}
              className={`chip ${
                settings.assistantLength === l.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-ink-soft"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="assistant-notes">Anything it should know</Label>
        <textarea
          id="assistant-notes"
          value={notes}
          maxLength={600}
          rows={3}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Long lists overwhelm me — give me one thing. Mornings are my best hours."
          className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-ink-soft">{notes.length}/600</span>
          <Button
            size="sm"
            disabled={!dirty}
            onClick={() => actions.updateSettings({ assistantNotes: notes })}
            className="rounded-full"
          >
            {dirty ? "Save" : "Saved"}
          </Button>
        </div>
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
      <h2 className="font-serif text-lg">Data</h2>
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
            <AlertDialogTitle className="font-serif text-lg">Clear everything?</AlertDialogTitle>
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

/** Reachable from inside the app too, not only from the sign-in page —
 *  someone who wants to check what happens to their calendar should not have
 *  to sign out to find out. Split out from the data card it used to sit
 *  under so it can be its own line in the Profile tab. */
function PrivacyTermsSection() {
  return (
    <section className="card-soft p-6 space-y-3">
      <h2 className="font-serif text-lg">Privacy &amp; terms</h2>
      <p className="text-sm text-ink-soft">
        <Link to="/privacy" className="underline underline-offset-4 hover:text-ink">
          Privacy policy
        </Link>
        <span className="mx-2">&middot;</span>
        <Link to="/terms" className="underline underline-offset-4 hover:text-ink">
          Terms of use
        </Link>
      </p>
    </section>
  );
}
