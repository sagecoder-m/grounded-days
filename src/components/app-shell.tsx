import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Briefcase,
  CalendarDays,
  Cloud,
  CloudOff,
  GraduationCap,
  Home,
  Lock,
  LogOut,
  Menu,
  NotebookPen,
  RefreshCw,
  Sparkles,
  Sprout,
  User,
} from "lucide-react";

import { useApp, useSyncStatus } from "@/lib/store";
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
  { to: "/", label: "Overview", icon: Home },
  { to: "/journal", label: "Journal", icon: NotebookPen },
  { to: "/personal", label: "Personal", icon: Sprout },
  { to: "/professional", label: "Professional", icon: Briefcase },
  { to: "/education", label: "Education", icon: GraduationCap },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/assistant", label: "Assistant", icon: Sparkles },
  { to: "/profile", label: "Profile", icon: User },
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
            <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</div>
          </main>
        </>
      ) : (
        <div className="md:flex md:min-h-screen">
          <aside
            className={`hidden shrink-0 border-r border-border bg-card md:flex md:flex-col ${
              railCollapsed ? "md:w-[4.5rem]" : "md:w-60"
            }`}
          >
            <div
              className={`flex items-center gap-2 py-6 ${railCollapsed ? "justify-center px-3" : "px-6"}`}
            >
              {railCollapsed ? <Brand variant="icon" /> : <Brand subtitle />}
            </div>

            <button
              onClick={() => setRailCollapsed((v) => !v)}
              aria-label={railCollapsed ? "Expand navigation" : "Collapse navigation"}
              aria-expanded={!railCollapsed}
              className={`mb-2 flex items-center gap-3 rounded-2xl py-2 text-sm text-ink-soft transition-colors hover:bg-secondary ${
                railCollapsed ? "mx-3 justify-center px-0" : "mx-3 px-3"
              }`}
            >
              <Menu className="h-4 w-4 shrink-0" />
              {!railCollapsed && <span>Collapse</span>}
            </button>

            <nav className="flex-1 space-y-1 px-3">
              {NAV.map((n) => {
                const active = pathname === n.to;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    title={railCollapsed ? n.label : undefined}
                    className={`flex items-center gap-3 rounded-2xl py-2.5 text-sm transition-colors ${
                      railCollapsed ? "justify-center px-0" : "px-3"
                    } ${active ? "text-ink" : "text-ink-soft hover:bg-secondary"}`}
                    style={
                      active
                        ? {
                            backgroundColor: "color-mix(in oklab, var(--primary) 14%, transparent)",
                          }
                        : undefined
                    }
                  >
                    <n.icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
                    {!railCollapsed && n.label}
                  </Link>
                );
              })}
            </nav>

            {!railCollapsed && (
              <div className="space-y-3 px-4 py-6 text-xs text-ink-soft">
                <AccountBox />
                <p className="px-2 italic">One thing at a time.</p>
              </div>
            )}
          </aside>

          <main className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">{children}</div>
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

function AccountBox({ compact = false }: { compact?: boolean }) {
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
