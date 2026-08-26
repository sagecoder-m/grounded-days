import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  Cloud,
  CloudOff,
  Home,
  Lock,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  NotebookPen,
  RefreshCw,
  Sparkles,
  Sprout,
  User,
} from "lucide-react";

import { AREA_META, useApp, useSyncStatus } from "@/lib/store";
import { useSession } from "@/lib/use-session";
import { useSignOut } from "@/lib/use-sign-out";
import { lockNow } from "@/lib/use-passcode";
import { installErrorReporting, track } from "@/lib/telemetry";

/**
 * One order, used by all three layouts — the side rail, the desktop top tabs and
 * the mobile icon row — so the tabs never sit in a different sequence depending
 * on the screen.
 *
 * Personal sits with the other two areas rather than where the requested order
 * put it, because that order named seven tabs for eight pages and left Personal
 * out. This is the only link to it anywhere in the app, so dropping it would
 * have left habits and personal goals reachable only by typing the URL.
 * Personal / Professional / Education is also the sequence used everywhere else.
 */
const NAV = [
  { to: "/", label: "Overview", icon: Home, group: "daily" },
  { to: "/journal", label: "Journal", icon: NotebookPen, group: "daily" },
  // Areas take their icon from AREA_META, the same one their chips use.
  {
    to: "/personal",
    label: AREA_META.personal.label,
    icon: AREA_META.personal.icon,
    group: "areas",
  },
  {
    to: "/professional",
    label: AREA_META.professional.label,
    icon: AREA_META.professional.icon,
    group: "areas",
  },
  {
    to: "/education",
    label: AREA_META.education.label,
    icon: AREA_META.education.icon,
    group: "areas",
  },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, group: "tools" },
  { to: "/assistant", label: "Assistant", icon: Sparkles, group: "tools" },
  { to: "/profile", label: "Profile", icon: User, group: "tools" },
] as const;

/**
 * How the side rail breaks the list up. Eight undifferentiated rows is a list to
 * read; three small groups is a shape to scan, and the groups are real — two
 * daily screens, the three life areas, then the tools that serve them.
 *
 * Derived from NAV rather than restating it, so the order stays defined once.
 * Profile sits in Tools: it is a place you go, and pinning it away from the other
 * destinations made it the one nav item in its own private section.
 */
const RAIL_GROUPS = [
  { key: "daily", label: "Day to day" },
  { key: "areas", label: "Your areas" },
  { key: "tools", label: "Tools" },
] as const;

/**
 * The mark doubles as the way home from anywhere, which is the convention
 * everywhere else on the web and one less thing to hunt for in the nav.
 */
function Brand({
  variant = "full",
  subtitle = false,
}: {
  /** "icon" drops the wordmark, for the collapsed rail where it cannot fit. */
  variant?: "full" | "icon";
  subtitle?: boolean;
}) {
  return (
    <Link
      to="/"
      aria-label="Back to overview"
      title="Back to overview"
      className="flex items-center gap-2 rounded-2xl transition-opacity hover:opacity-80"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
        <Sprout className="h-4.5 w-4.5" />
      </div>
      {variant === "full" && (
        <div>
          <div className="font-serif text-xl leading-none">grounded</div>
          {subtitle && <div className="mt-1 text-xs text-ink-soft">gently held</div>}
        </div>
      )}
    </Link>
  );
}

/**
 * The signed-in, unlocked chrome. Only mounted from behind AppGate, so it can
 * read user data freely — nothing here renders before the passcode is accepted.
 *
 * Two layouts, chosen in Profile. They differ only on wide screens: narrow ones
 * always get the top bar, because a sidebar on a phone is just a drawer nobody
 * opens.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const settings = useApp((s) => s.settings);
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  /**
   * The Overview is a dashboard and gets the width of the screen; every other
   * page keeps a reading measure.
   *
   * The caps were 1152px with the side rail and 1024px with top tabs, which on a
   * wide monitor left a few hundred pixels of dead space either side of the board
   * that no widget could reach — the whole point of choosing "third width" is
   * having somewhere to put things. Journal, Assistant and the area pages are
   * mostly prose and lists, and stay narrow, because a 1500px line of text is
   * miserable to read.
   */
  const isBoard = pathname === "/";
  // Collapsing is a per-session preference, not worth a round trip to store.
  const [railCollapsed, setRailCollapsed] = useState(false);

  // Telemetry lives here because AppShell only mounts behind the passcode gate:
  // a page_view can never fire for a locked or signed-out screen. track() sends
  // the route name only — see telemetry.ts for the full privacy contract.
  useEffect(() => {
    installErrorReporting();
    track("page_view");
  }, [pathname]);

  const topLayout = settings.navLayout === "top";

  return (
    <div
      data-accent={settings.accent}
      data-density={settings.density}
      className="min-h-screen bg-background text-foreground"
    >
      {/* Narrow screens: one bar, both layouts. */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Brand />
          <AccountBox compact />
        </div>
        <NavChips pathname={pathname} />
      </header>

      {topLayout ? (
        <>
          <header className="sticky top-0 z-30 hidden border-b border-border bg-card/80 backdrop-blur md:block">
            {/*
              Icons, not labels.
              
              Measured at 1280px: eight labelled tabs come to 910px, plus a 134px
              brand, a 140px account box and 76px of gaps — 1260px of content in
              a container max-w-6xl caps at 1152. The overflow pushed the account
              box 76px off-screen and squeezed "Sign out" onto two lines. Widening
              the container was the alternative, but it would have left the brand
              hanging 64px outside the page content below it.
              
              min-w-0 on the nav and shrink-0 on the account box are the
              structural half of the fix: without them a flex-1 nav claims its
              full content width and shoves its siblings out of the container
              rather than yielding, which is what happened here and would happen
              again the next time a tab is added.
            */}
            <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-8 py-3">
              <Brand />
              <nav
                aria-label="Sections"
                className="flex min-w-0 flex-1 items-center justify-center gap-1"
              >
                {NAV.map((n) => {
                  const active = pathname === n.to;
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      aria-label={n.label}
                      title={n.label}
                      aria-current={active ? "page" : undefined}
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${
                        active ? "text-ink" : "text-ink-soft hover:bg-secondary"
                      }`}
                      style={
                        active
                          ? {
                              backgroundColor:
                                "color-mix(in oklab, var(--primary) 14%, transparent)",
                            }
                          : undefined
                      }
                    >
                      <n.icon className={`h-[18px] w-[18px] ${active ? "text-primary" : ""}`} />
                    </Link>
                  );
                })}
              </nav>
              <div className="shrink-0">
                <AccountBox compact />
              </div>
            </div>
          </header>
          <main className="min-w-0">
            <div
              className={`mx-auto w-full px-4 py-6 md:px-8 md:py-10 ${
                isBoard ? "max-w-[96rem]" : "max-w-6xl"
              }`}
            >
              {children}
            </div>
          </main>
        </>
      ) : (
        <div className="md:flex md:min-h-screen">
          <aside
            className={`hidden shrink-0 border-r border-border bg-card md:flex md:flex-col ${
              railCollapsed ? "md:w-[4.5rem]" : "md:w-60"
            }`}
          >
            {/*
              The collapse control lives in the brand row, not the nav.
              
              It used to be the first item in the list, with the same pill shape,
              text size and hover as the real destinations — so the eye had to
              rule it out before finding anywhere to go. It is a control on the
              rail, so it sits with the rail's header.
            */}
            <div
              className={`flex items-center py-5 ${
                railCollapsed ? "justify-center px-3" : "justify-between px-5"
              }`}
            >
              {railCollapsed ? <Brand variant="icon" /> : <Brand subtitle />}
              {!railCollapsed && (
                <button
                  onClick={() => setRailCollapsed(true)}
                  aria-label="Collapse navigation"
                  aria-expanded
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-soft opacity-60 transition-all hover:bg-secondary hover:text-ink hover:opacity-100 focus-visible:opacity-100"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              )}
            </div>

            {railCollapsed && (
              <button
                onClick={() => setRailCollapsed(false)}
                aria-label="Expand navigation"
                aria-expanded={false}
                className="mx-auto mb-3 grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-secondary hover:text-ink"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}

            <nav className="flex-1 px-3" aria-label="Sections">
              {RAIL_GROUPS.map((group, groupIndex) => {
                const items = NAV.filter((n) => n.group === group.key);
                if (items.length === 0) return null;
                return (
                  <div key={group.key} className={groupIndex === 0 ? "" : "mt-5"}>
                    {/* Collapsed, the labels would not fit, so a hairline carries
                        the grouping instead of losing it. */}
                    {railCollapsed ? (
                      groupIndex > 0 && <div className="mx-auto mb-3 h-px w-6 bg-border" />
                    ) : (
                      <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                        {group.label}
                      </p>
                    )}
                    <div className="space-y-0.5">
                      {items.map((n) => (
                        <RailLink
                          key={n.to}
                          item={n}
                          active={pathname === n.to}
                          collapsed={railCollapsed}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </nav>

            {/* Collapsed used to hide this whole block, which took Lock and Sign
                out with it — a rail you collapsed could not be signed out of.
                Collapsed now gets the same two controls as icons. */}
            <div className="mt-4 border-t border-border px-3 pb-4 pt-3">
              <AccountBox compact={railCollapsed} iconsOnly={railCollapsed} />
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <div
              className={`mx-auto w-full px-4 py-6 md:px-8 md:py-10 ${
                isBoard ? "max-w-[96rem]" : "max-w-5xl"
              }`}
            >
              {children}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

/**
 * The narrow-screen tab row: icons only.
 *
 * With labels these eight chips wrapped onto three lines and pushed the page
 * itself below the fold. Eight 36px targets plus gaps fit one row at 375px, and
 * 36px is a comfortable touch target.
 *
 * The label survives as aria-label and title rather than being thrown away, so
 * the row still reads correctly to a screen reader and a hover or long-press
 * names each icon.
 */
/**
 * One row in the side rail.
 *
 * The active row gets a left accent bar as well as the tint. The tint alone is a
 * soft wash at 14% and, in a list of eight, took a moment to locate; a 2px bar
 * on the edge is found without reading anything.
 */
function RailLink({
  item,
  active,
  collapsed,
}: {
  item: (typeof NAV)[number];
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      to={item.to}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-3 rounded-xl py-2 text-sm transition-colors ${
        collapsed ? "justify-center px-0" : "px-3"
      } ${active ? "font-medium text-ink" : "text-ink-soft hover:bg-secondary hover:text-ink"}`}
      style={
        active
          ? { backgroundColor: "color-mix(in oklab, var(--primary) 12%, transparent)" }
          : undefined
      }
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
        />
      )}
      <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function NavChips({ pathname }: { pathname: string }) {
  return (
    <nav className="flex items-center justify-between gap-1 px-3 pb-2" aria-label="Sections">
      {NAV.map((n) => {
        const active = pathname === n.to;
        return (
          <Link
            key={n.to}
            to={n.to}
            aria-label={n.label}
            title={n.label}
            aria-current={active ? "page" : undefined}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors ${
              active ? "bg-primary text-primary-foreground" : "text-ink-soft hover:bg-secondary"
            }`}
          >
            <n.icon className="h-[18px] w-[18px]" />
          </Link>
        );
      })}
    </nav>
  );
}

function AccountBox({
  compact = false,
  iconsOnly = false,
}: {
  compact?: boolean;
  /** Collapsed rail: the same two controls with their labels dropped. */
  iconsOnly?: boolean;
}) {
  const { user } = useSession();
  const sync = useSyncStatus();
  const signOut = useSignOut();

  if (!user) return null;

  const syncIcon =
    sync === "syncing" ? (
      <RefreshCw className="h-3 w-3 animate-spin" />
    ) : sync === "error" ? (
      <CloudOff className="h-3 w-3" />
    ) : (
      <Cloud className="h-3 w-3" />
    );

  if (iconsOnly) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <button
          onClick={lockNow}
          aria-label="Lock"
          title="Lock"
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-secondary hover:text-ink"
        >
          <Lock className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={signOut}
          aria-label="Sign out"
          title="Sign out"
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-secondary hover:text-ink"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={lockNow}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-[11px] text-ink-soft"
          aria-label="Lock"
        >
          <Lock className="h-3 w-3" />
          Lock
        </button>
        <button
          onClick={signOut}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-[11px] text-ink-soft"
        >
          {syncIcon}
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 rounded-2xl border border-border px-3 py-2.5">
      <div className="truncate text-[11px] text-ink-soft" title={user.email ?? ""}>
        {user.email}
      </div>
      <div className="flex items-center gap-1.5 text-[11px]">
        {syncIcon}
        <span>
          {sync === "syncing"
            ? "Saving…"
            : sync === "error"
              ? "Sync paused"
              : "Saved to your account"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px]">
        <button
          onClick={lockNow}
          className="flex items-center gap-1.5 underline underline-offset-4"
        >
          <Lock className="h-3 w-3" /> Lock
        </button>
        <button
          onClick={signOut}
          className="flex items-center gap-1.5 underline underline-offset-4"
        >
          <LogOut className="h-3 w-3" /> Sign out
        </button>
      </div>
    </div>
  );
}
