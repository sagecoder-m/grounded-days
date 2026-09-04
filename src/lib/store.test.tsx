import { afterEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { useCalendarDataLoaded } from "./store";
import { setStoreContext } from "./db/context";
import { qk } from "./db/keys";

/**
 * The gate that decides when the calendar may be built.
 *
 * This is the third version of the same fix, and the reason it needed a third
 * is that each earlier one waited for less than the calendar actually draws
 * from. What makes it worth a test rather than a careful read: the failure is
 * invisible on a small account. The demo account has six events and looks
 * perfect; the account with two synced calendars has a hundred and twenty-four
 * and flashes. Nothing about the code says which accounts are affected, so
 * nothing about looking at it tells you it is wrong.
 */

const USER = "user-1";

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** A client with nothing fetched and no network — queries stay pending. */
function emptyClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: () => new Promise(() => {}) } },
  });
}

/** Seeds one collection, as a completed fetch would. */
function seed(client: QueryClient, key: readonly unknown[], value: unknown) {
  client.setQueryData(key, value);
}

afterEach(() => setStoreContext(null));

describe("useCalendarDataLoaded", () => {
  it("is false with nobody signed in, because nothing is being fetched", () => {
    setStoreContext(null);
    const client = emptyClient();
    const { result } = renderHook(() => useCalendarDataLoaded(), { wrapper: wrapper(client) });
    expect(result.current).toBe(false);
  });

  it("is false while any one collection is still in flight", () => {
    const client = emptyClient();
    setStoreContext({ queryClient: client, userId: USER });

    // Everything the calendar draws from, except the events themselves.
    seed(client, qk.settings(USER), { theme: "light" });
    seed(client, qk.tasks(USER), []);
    seed(client, qk.goals(USER), []);
    seed(client, qk.courses(USER), []);

    const { result } = renderHook(() => useCalendarDataLoaded(), { wrapper: wrapper(client) });

    // This is the exact state that built an empty calendar: settings known,
    // so the old gate opened, while the 124 events were still on the wire.
    expect(result.current).toBe(false);
  });

  it("is true once every collection has arrived", () => {
    const client = emptyClient();
    setStoreContext({ queryClient: client, userId: USER });

    seed(client, qk.settings(USER), { theme: "light" });
    seed(client, qk.tasks(USER), []);
    seed(client, qk.goals(USER), []);
    seed(client, qk.courses(USER), []);
    seed(client, qk.events(USER), []);

    const { result } = renderHook(() => useCalendarDataLoaded(), { wrapper: wrapper(client) });
    expect(result.current).toBe(true);
  });

  it("stays true when a collection is empty, which is a real answer", () => {
    // An account with no events at all must not wait forever for some.
    const client = emptyClient();
    setStoreContext({ queryClient: client, userId: USER });

    for (const key of [
      qk.settings(USER),
      qk.tasks(USER),
      qk.goals(USER),
      qk.courses(USER),
      qk.events(USER),
    ]) {
      seed(client, key, []);
    }

    const { result } = renderHook(() => useCalendarDataLoaded(), { wrapper: wrapper(client) });
    expect(result.current).toBe(true);
  });
});
