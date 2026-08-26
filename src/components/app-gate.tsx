import { useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";

import { setStoreContext } from "@/lib/db/context";
import { importLocalBlobIfNeeded } from "@/lib/db/migrate-local";
import { useMounted } from "@/lib/use-mounted";
import { useSession } from "@/lib/use-session";
import { useHasPasscode, useUnlocked } from "@/lib/use-passcode";
import { AppShell } from "@/components/app-shell";
import { GateSkeleton, PasscodeLock, PasscodeSetup } from "@/components/passcode-screen";

/**
 * Routes reachable without a session, so they must never be gated.
 *
 * /share is public on purpose: a share link is opened by someone who has no
 * account here, and its own token is what authorises what they see. It renders
 * with no app chrome so none of the owner's navigation is exposed.
 */
// Privacy and terms are public because they have to be: Google will not let an
// OAuth consent screen out of Testing without a policy reachable without signing
// in, and someone deciding whether to trust the app with their calendar cannot
// be asked to create an account first to find out what it does with it.
const PUBLIC_PATHS = ["/auth", "/share", "/privacy", "/terms"] as const;
const SHARE_PATH = "/share";

function matches(pathname: string, route: string): boolean {
  // Trailing-slash tolerant: the static host serves /share/ and the router may
  // see either form depending on how the link was opened.
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => matches(pathname, p));
}

function isSharePath(pathname: string): boolean {
  return matches(pathname, SHARE_PATH);
}

/**
 * Minimal chrome for the sign-in page: same background, no navigation. The app
 * shell's sidebar must not be visible to someone who isn't through the gate.
 */
function BareShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">{children}</div>
    </div>
  );
}

/**
 * Wraps the entire app shell. Nothing behind the gate is *mounted* until the
 * user is signed in and unlocked — not merely hidden. That is what guarantees
 * real data never flashes: unmounted routes fire no queries, so there is no
 * data in the tree to leak, and the SSR HTML contains only the skeleton.
 *
 * Order of the branches below is load-bearing. `mounted` is checked first so the
 * server render and the first client render are identical (both skeleton),
 * which removes the hydration mismatch instead of suppressing it.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  const { user, loading } = useSession();
  const unlocked = useUnlocked();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const hasPasscode = useHasPasscode(user?.id ?? null);
  const importedFor = useRef<string | null>(null);

  // Register / clear the handle that `actions` writes through.
  useEffect(() => {
    setStoreContext(user ? { queryClient, userId: user.id } : null);
  }, [user, queryClient]);

  // Send signed-out visitors to /auth. Done in an effect rather than a redirect
  // during render so the router isn't navigated mid-commit.
  useEffect(() => {
    if (!mounted || loading) return;
    if (!user && !isPublicPath(pathname)) {
      navigate({ to: "/auth", replace: true });
    }
  }, [mounted, loading, user, pathname, navigate]);

  // One-time import of the legacy localStorage blob, once past the gate.
  useEffect(() => {
    if (!user || !unlocked) return;
    if (importedFor.current === user.id) return;
    importedFor.current = user.id;

    void importLocalBlobIfNeeded(user.id)
      .then(async (count) => {
        if (count === 0) return;
        await queryClient.invalidateQueries({ queryKey: ["grounded", user.id] });
        toast.success("Your earlier data came across", {
          description: `${count} ${count === 1 ? "item" : "items"} restored from this device.`,
        });
      })
      .catch((err: unknown) => {
        importedFor.current = null;
        toast.error("Couldn't bring over your earlier data", {
          description: err instanceof Error ? err.message : "It's still safe on this device.",
        });
      });
  }, [user, unlocked, queryClient]);

  // 1. SSR and first client paint.
  if (!mounted) return <GateSkeleton />;

  // 2. A share link authorises itself with its token, so it neither waits for a
  // session nor borrows any of this app's chrome — it renders its own page even
  // when the owner happens to be signed in on the same device.
  if (isSharePath(pathname)) return <>{children}</>;

  if (loading) return <GateSkeleton />;

  // 3. Signed out: only the sign-in page renders, without app chrome.
  if (!user) {
    return isPublicPath(pathname) ? <BareShell>{children}</BareShell> : <GateSkeleton />;
  }

  // 4. Signed in but sitting on /auth — auth.tsx redirects to "/" itself.
  if (isPublicPath(pathname)) return <BareShell>{children}</BareShell>;

  // 4. Still learning whether a passcode exists.
  if (hasPasscode.isPending) return <GateSkeleton />;

  // 5. Couldn't reach the RPC. Fail closed — never fall through to the app.
  if (hasPasscode.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <h1 className="font-serif text-2xl">Can't reach your lock</h1>
          <p className="mt-2 text-sm text-ink-soft">
            We couldn't check your passcode just now. Check your connection and try again.
          </p>
          <button
            onClick={() => void hasPasscode.refetch()}
            className="mt-6 rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // 6. First run: no passcode set yet.
  if (!hasPasscode.data) return <PasscodeSetup />;

  // 7. Locked.
  if (!unlocked) return <PasscodeLock />;

  // 8. Through the gate — only now does the app shell mount.
  return <AppShell>{children}</AppShell>;
}
