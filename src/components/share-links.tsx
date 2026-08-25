import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Link2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { createShareLink, DEFAULT_SHARE_DAYS } from "@/lib/share";
import { track } from "@/lib/telemetry";
import { AREA_META } from "@/lib/store";
import type { Area } from "@/lib/store-types";
import { useSession } from "@/lib/use-session";

interface ShareLinkRow {
  id: string;
  label: string | null;
  areas: Area[];
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_at: string;
}

function expiryLabel(row: ShareLinkRow): string {
  if (row.revoked_at) return "turned off";
  if (!row.expires_at) return "no expiry";
  const ms = Date.parse(row.expires_at) - Date.now();
  if (ms <= 0) return "expired";
  const days = Math.ceil(ms / 86_400_000);
  return days === 1 ? "expires tomorrow" : `expires in ${days} days`;
}

export function ShareLinksSection() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [areas, setAreas] = useState<Area[]>([]);
  const [label, setLabel] = useState("");
  // Held in memory only. Once this is cleared the URL is unrecoverable, because
  // the database stores just its hash.
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const links = useQuery({
    queryKey: ["shareLinks", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const res = await supabase
        .from("share_links")
        .select("id, label, areas, expires_at, revoked_at, view_count, last_viewed_at, created_at")
        .order("created_at", { ascending: false });
      if (res.error) throw new Error(res.error.message);
      return (res.data ?? []) as ShareLinkRow[];
    },
  });

  const create = useMutation({
    mutationFn: () => createShareLink({ areas, label, expiresInDays: DEFAULT_SHARE_DAYS }),
    onSuccess: (url) => {
      track("share_link_create");
      setFreshUrl(url);
      setCopied(false);
      setAreas([]);
      setLabel("");
      void queryClient.invalidateQueries({ queryKey: ["shareLinks", user?.id] });
    },
    onError: (err: Error) => toast.error("Couldn't create that link", { description: err.message }),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase
        .from("share_links")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      toast.success("Link turned off");
      void queryClient.invalidateQueries({ queryKey: ["shareLinks", user?.id] });
    },
    onError: (err: Error) => toast.error("Couldn't turn that off", { description: err.message }),
  });

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      track("share_link_copy");
      setCopied(true);
      toast.success("Link copied");
    } catch {
      // Clipboard access is denied in some mobile browsers; the URL is on
      // screen and selectable, so this is not a dead end.
      toast.error("Couldn't copy", { description: "Select the link and copy it manually." });
    }
  }

  const rows = links.data ?? [];

  function toggleArea(area: Area) {
    setAreas((prev) => (prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]));
  }

  return (
    <section className="card-soft space-y-5 p-6">
      <div>
        <h2 className="font-serif text-lg">Share a read-only view</h2>
        <p className="mt-2 max-w-lg text-sm text-ink-soft">
          Create a link that shows only the areas you choose. Whoever opens it needs no account and
          can't change anything — and it stops working after {DEFAULT_SHARE_DAYS} days.
        </p>
      </div>

      {/* Shown once. There is no way to retrieve it again, so it is deliberately
          prominent rather than a quiet toast. */}
      {freshUrl && (
        <div className="space-y-2 rounded-2xl border border-primary bg-accent p-4">
          <p className="text-sm font-medium">Your link is ready — copy it now</p>
          <p className="text-xs text-ink-soft">
            This is the only time it can be shown. If you lose it, turn it off and make a new one.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-xl bg-card px-3 py-2 text-[11px]">
              {freshUrl}
            </code>
            <Button size="sm" onClick={() => void copy(freshUrl)} className="gap-1.5 rounded-full">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFreshUrl(null)}
            className="rounded-full text-ink-soft"
          >
            Done
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-soft">Include</span>
          {(Object.keys(AREA_META) as Area[]).map((area) => (
            <button
              key={area}
              onClick={() => toggleArea(area)}
              className={`chip capitalize ${
                areas.includes(area)
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-ink-soft"
              }`}
            >
              {areas.includes(area) && <Check className="mr-1 inline h-3 w-3" />}
              {area}
            </button>
          ))}
        </div>

        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Who is this for? (optional)"
          className="max-w-xs"
        />

        <Button
          onClick={() => create.mutate()}
          disabled={areas.length === 0 || create.isPending}
          className="gap-2 rounded-full"
        >
          <Link2 className="h-4 w-4" />
          {create.isPending ? "Creating…" : "Create link"}
        </Button>
        {areas.length === 0 && (
          <p className="text-xs text-ink-soft italic">Pick at least one area to share.</p>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="space-y-2 border-t border-border pt-4">
          {rows.map((row) => {
            const inactive = Boolean(row.revoked_at) || expiryLabel(row) === "expired";
            return (
              <li
                key={row.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
                  inactive ? "border-dashed border-border opacity-60" : "border-border"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {row.label || "Untitled link"}
                    <span className="ml-2 text-xs font-normal text-ink-soft capitalize">
                      {row.areas.join(", ")}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-soft">
                    {expiryLabel(row)}
                    {" · "}
                    {row.view_count === 0
                      ? "not opened yet"
                      : `opened ${row.view_count} time${row.view_count === 1 ? "" : "s"}`}
                  </div>
                </div>
                {!inactive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke.mutate(row.id)}
                    disabled={revoke.isPending}
                    className="gap-1.5 rounded-full text-ink-soft"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Turn off
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
