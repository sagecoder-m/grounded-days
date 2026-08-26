import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { PUBLIC_SUPABASE_URL } from "@/integrations/supabase/public-config";

/**
 * Everything the console setup needs, in the app rather than in a chat log.
 *
 * Connecting a calendar means pasting exact strings into Google Cloud Console
 * and Azure — a callback URL, authorised domains, a privacy policy link. Those
 * values were only ever available by asking, which made every setup step a
 * round trip through somebody who happened to know them.
 *
 * Every value here is derived at runtime from where the app is actually running,
 * not typed in. Move to a custom domain and this panel is right the moment the
 * page loads; hardcoding would have made it a second place to be wrong.
 */

/**
 * Best guess at what Google wants in "Authorised domains": the registrable
 * domain, not the full host.
 *
 * Last two labels, which is right for vercel.app and supabase.co and wrong for
 * a multi-part suffix like co.uk. Doing it properly needs the Public Suffix
 * List, which is not worth shipping for one field — so the full host is shown
 * alongside and the note says to try that if Google refuses the short form.
 */
function registrableDomain(host: string): string {
  // Port stripped first: Google wants a domain, and "localhost:8080" would be
  // rejected outright — visible only when running locally, but wrong either way.
  const parts = host.replace(/:\d+$/, "").split(".");
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".");
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Refused in some browsers and over plain http; the value is selectable.
      toast.error("Couldn't copy", { description: "Select the value and copy it manually." });
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-ink">{label}</span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={`Copy ${label}`}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-soft transition-colors hover:bg-secondary hover:text-ink"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" style={{ color: "var(--sage-deep)" }} />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {/* break-all so a long URL wraps inside the card instead of widening the
          panel and pushing the page sideways. */}
      <code className="mt-1 block select-all whitespace-pre-line break-all font-mono text-[11px] text-ink-soft">
        {value}
      </code>
      {note && <p className="mt-1.5 text-[11px] text-ink-soft">{note}</p>}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-secondary text-[10px] tabular-nums text-ink-soft">
        {n}
      </span>
      <span className="flex-1 pt-0.5">{children}</span>
    </li>
  );
}

function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-ink"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export function SetupPanel() {
  // Where the app is actually served from, so a custom domain needs no edit here.
  const appOrigin = typeof window === "undefined" ? "" : window.location.origin;
  const appHost = appOrigin.replace(/^https?:\/\//, "");
  const supabaseHost = PUBLIC_SUPABASE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const callback = `${PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/functions/v1/calendar-oauth-callback`;

  const domains = [...new Set([registrableDomain(appHost), registrableDomain(supabaseHost)])];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">Setup</h2>
        <span className="text-xs text-ink-soft">Values for the Google and Microsoft consoles</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-soft space-y-3 p-4 md:p-6">
          <h3 className="text-sm text-ink-soft">Paste these into the console</h3>

          <Row
            label="Authorised redirect URI"
            value={callback}
            note="Google: Credentials → your OAuth client. Azure: App registration → Authentication."
          />
          <Row label="App homepage" value={appOrigin} />
          <Row label="Privacy policy" value={`${appOrigin}/privacy`} />
          <Row label="Terms of service" value={`${appOrigin}/terms`} />
          <Row
            label="Authorised domains"
            value={domains.join("\n")}
            note={`One per line. If Google refuses these, try the full hosts instead — ${appHost} and ${supabaseHost}.`}
          />

          {/*
            The thing that decides whether verification is even possible, said
            before the effort is spent rather than after it fails.
          */}
          <p className="rounded-2xl border border-dashed border-tan bg-secondary/60 p-3 text-[11px] leading-relaxed text-ink-soft">
            <span className="text-ink">Worth knowing before you try to verify.</span> Google
            requires every authorised domain to be one you can prove you own, in Search Console.
            Neither <code>{registrableDomain(appHost)}</code> nor{" "}
            <code>{registrableDomain(supabaseHost)}</code> is yours. Publishing unverified is fine
            without that; full verification is not possible until the app and the callback both sit
            on a domain you control.
          </p>
        </div>

        <div className="card-soft space-y-4 p-4 md:p-6">
          <h3 className="text-sm text-ink-soft">Google, from Testing to published</h3>

          <ol className="space-y-2.5 text-xs leading-relaxed text-ink-soft">
            <Step n={1}>
              Open{" "}
              <Out href="https://console.cloud.google.com/auth/audience">Google Auth Platform</Out>{" "}
              &mdash; this used to be called the OAuth consent screen, which is why it can be hard
              to find. Check you are in the project whose OAuth client uses the redirect URI on the
              left.
            </Step>
            <Step n={2}>
              Under <span className="text-ink">Branding</span>, set the app name to{" "}
              <span className="text-ink">Grounded</span> and fill in the homepage, privacy and terms
              links. Left unset, people see the raw Supabase host asking for their calendar, which
              reads like phishing.
            </Step>
            <Step n={3}>
              Under <span className="text-ink">Audience</span>: while the app is in{" "}
              <span className="text-ink">Testing</span>, only accounts on the Test users list can
              connect &mdash; everyone else is refused with <code>403 access_denied</code>. Add a
              tester there to unblock them one at a time.
            </Step>
            <Step n={4}>
              Or press <span className="text-ink">Publish app</span>, which removes the list
              entirely and stops Google expiring refresh tokens every 7 days. Testers see a one-time
              &ldquo;Google hasn&rsquo;t verified this app&rdquo; screen and continue past it.
            </Step>
            <Step n={5}>
              Enable the{" "}
              <Out href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com">
                Google Calendar API
              </Out>{" "}
              if it is not already on, and confirm the redirect URI under{" "}
              <Out href="https://console.cloud.google.com/apis/credentials">Credentials</Out>.
            </Step>
          </ol>

          <div className="border-t border-border pt-3">
            <h3 className="text-sm text-ink-soft">Microsoft</h3>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              In{" "}
              <Out href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade">
                App registrations
              </Out>{" "}
              → Authentication, add the same redirect URI. If sign-in fails with &ldquo;we&rsquo;re
              having trouble signing you in&rdquo;, the cause is almost always{" "}
              <span className="text-ink">Supported account types</span>: it needs to allow any
              organisational directory <em>and</em> personal Microsoft accounts.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
