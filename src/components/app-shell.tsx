import type { ReactNode } from "react";
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
  RefreshCw,
  Sprout,
  User,
} from "lucide-react";

import { useApp, useSyncStatus } from "@/lib/store";
import { useSession } from "@/lib/use-session";
import { useSignOut } from "@/lib/use-sign-out";
import { lockNow } from "@/lib/use-passcode";

const NAV = [
  { to: "/", label: "Overview", icon: Home },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/personal", label: "Personal", icon: Sprout },
  { to: "/professional", label: "Professional", icon: Briefcase },
  { to: "/education", label: "Education", icon: GraduationCap },
  { to: "/profile", label: "Profile", icon: User },
] as const;

/**
 * The signed-in, unlocked chrome. Only mounted from behind AppGate, so it can
 * read user data freely — nothing here renders before the passcode is accepted.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const settings = useApp((s) => s.settings);
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <div
      data-accent={settings.accent}
      data-density={settings.density}
      className="min-h-screen bg-background text-foreground"
    >
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">
              <Sprout className="h-4 w-4" />
            </div>
            <span className="font-serif text-lg">Grounded</span>
          </div>
          <AccountBox compact />
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map((n) => {
            const active = pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`chip whitespace-nowrap ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-ink-soft"}`}
              >
                <n.icon className="h-3.5 w-3.5" />
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="md:flex md:min-h-screen">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex md:flex-col md:w-60 md:shrink-0 border-r border-border bg-card">
          <div className="flex items-center gap-2 px-6 py-6">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
              <Sprout className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="font-serif text-xl leading-none">Grounded</div>
              <div className="text-xs text-ink-soft mt-1">gently held</div>
            </div>
          </div>
          <nav className="flex-1 px-3 space-y-1">
            {NAV.map((n) => {
              const active = pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors ${
                    active ? "bg-primary/12 text-ink" : "text-ink-soft hover:bg-secondary"
                  }`}
                  style={
                    active
                      ? { backgroundColor: "color-mix(in oklab, var(--primary) 14%, transparent)" }
                      : undefined
                  }
                >
                  <n.icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="px-4 py-6 text-xs text-ink-soft space-y-3">
            <AccountBox />
            <p className="italic px-2">One thing at a time.</p>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">{children}</div>
        </main>
      </div>
    </div>
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
      <div className="flex items-center gap-1.5">
        <button
          onClick={lockNow}
          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] text-ink-soft"
          aria-label="Lock"
        >
          <Lock className="h-3 w-3" />
          Lock
        </button>
        <button
          onClick={signOut}
          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] text-ink-soft"
        >
          {syncIcon}
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border px-3 py-2.5 space-y-1.5">
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
