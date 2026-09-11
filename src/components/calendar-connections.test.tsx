import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { CalendarConnectionsSection } from "./calendar-connections";
import { qk } from "@/lib/db/keys";
import type { CalendarConnection } from "@/lib/store-types";

/**
 * The tabs are the point of this change — connections sorted by reliability
 * instead of one flat list — so this is what earns a test rather than a
 * careful read: which tab opens first, which connection lands under which
 * label, and that a status nobody has yet reads as calm rather than broken.
 *
 * The component reaches for useRouter/useSearch on its own (the OAuth-
 * callback handling, unrelated to this change and already there before it),
 * so rendering it at all needs a real router — a small ad-hoc one built here
 * rather than the app's actual route tree, which pulls in every page for a
 * test about one section's tabs.
 */

vi.mock("@/lib/use-session", () => ({
  useSession: () => ({ session: null, user: { id: "user-1" }, loading: false }),
}));

const USER = "user-1";

function connection(
  over: Partial<CalendarConnection> & Pick<CalendarConnection, "id">,
): CalendarConnection {
  return {
    provider: "google",
    status: "connected",
    ...over,
  };
}

async function renderWith(rows: CalendarConnection[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(qk.calendarConnections(USER), rows);

  const rootRoute = createRootRoute({ component: () => <CalendarConnectionsSection /> });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
    context: { queryClient: client },
  });
  // The router matches its first route asynchronously; rendering before that
  // resolves is an empty <body> and every query below fails to find anything.
  await router.load();

  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("CalendarConnectionsSection tabs", () => {
  it("sorts each connection under its own status tab, with a count", async () => {
    await renderWith([
      connection({ id: "a", status: "connected", accountEmail: "a@example.com" }),
      connection({ id: "b", status: "connected", accountEmail: "b@example.com" }),
      connection({ id: "c", status: "needs_reauth", accountEmail: "c@example.com" }),
      connection({ id: "d", status: "error", accountEmail: "d@example.com" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: /^Working/ }));
    expect(screen.getByText("a@example.com")).toBeTruthy();
    expect(screen.getByText("b@example.com")).toBeTruthy();
    expect(screen.queryByText("c@example.com")).toBeNull();
    expect(screen.queryByText("d@example.com")).toBeNull();
  });

  it("opens on the most severe non-empty tab, not always Working", async () => {
    await renderWith([
      connection({ id: "a", status: "connected", accountEmail: "healthy@example.com" }),
      connection({ id: "b", status: "error", accountEmail: "stuck@example.com" }),
    ]);
    // "Not syncing" (error) outranks both "Working" and "Needs reconnecting",
    // so it is what greets you without clicking anything — the actual problem
    // leads, since Profile is somewhere you go to manage things.
    expect(screen.getByText("stuck@example.com")).toBeTruthy();
    expect(screen.queryByText("healthy@example.com")).toBeNull();
  });

  it("opens on Working when nothing is broken", async () => {
    await renderWith([
      connection({ id: "a", status: "connected", accountEmail: "fine@example.com" }),
    ]);
    expect(screen.getByText("fine@example.com")).toBeTruthy();
  });

  it("reads a tab with nothing in it as calm, not alarming", async () => {
    await renderWith([connection({ id: "a", status: "connected" })]);
    fireEvent.click(screen.getByRole("button", { name: /^Needs reconnecting/ }));
    // No red, no "error" language — the empty state for a tab that is empty
    // because nothing is wrong reads as good news, not a blank failure.
    expect(screen.getByText(/Nothing needs reconnecting/)).toBeTruthy();
  });

  it("switching tabs shows only that status, and the count follows it", async () => {
    await renderWith([
      connection({ id: "a", status: "needs_reauth", accountEmail: "one@example.com" }),
      connection({ id: "b", status: "needs_reauth", accountEmail: "two@example.com" }),
    ]);
    const tab = screen.getByRole("button", { name: /^Needs reconnecting/ });
    expect(within(tab).getByText("2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Working/ }));
    expect(screen.queryByText("one@example.com")).toBeNull();
    expect(screen.getByText(/Nothing connected yet/)).toBeTruthy();
  });

  it("gives Terms and Privacy their own tab, linking the real pages rather than duplicating them", async () => {
    await renderWith([connection({ id: "a", status: "connected" })]);
    fireEvent.click(screen.getByRole("button", { name: /Terms & Privacy/ }));
    expect(screen.getByRole("link", { name: "Privacy policy" }).getAttribute("href")).toBe(
      "/privacy",
    );
    expect(screen.getByRole("link", { name: "Terms of use" }).getAttribute("href")).toBe("/terms");
    // The short, calendar-specific line lives here; the full documents do not
    // get copied in — one sentence, then a way to the real thing.
    expect(screen.getByText(/Calendars connect read-only/)).toBeTruthy();
  });

  it("keeps the Terms & Privacy tab reachable even with nothing connected", async () => {
    await renderWith([]);
    fireEvent.click(screen.getByRole("button", { name: /Terms & Privacy/ }));
    expect(screen.getByRole("link", { name: "Privacy policy" })).toBeTruthy();
  });
});
