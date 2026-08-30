import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RoutePending } from "./components/route-pending";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Rows are small and per-user; a short stale window plus a focus
        // refetch is what makes edits on one device show up on another.
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,

    /*
      Fetch a route's chunk when someone looks like they are about to open it —
      on hover, or on the first touch of a tap. By the time the click lands the
      code is usually already there, which is the difference between a page
      that appears and a page that arrives.

      This matters most for the calendar: DayFlow is the largest thing the app
      loads, and it is behind the one tab people open constantly.
    */
    defaultPreload: "intent",

    /*
      While a route is still loading, the router keeps rendering the one you
      came from. That is the right default for a fast transition and wrong for
      a slow one — the URL had already changed to /calendar while the Education
      page was still on screen, which reads as a link that did not work.

      pendingMs is how long it waits before admitting it is loading, and the
      library's default is a full second. A quarter of that is long enough that
      a quick navigation never flashes a placeholder and short enough that a
      slow one is never mistaken for a dead click. pendingMinMs then keeps the
      placeholder up briefly once shown, so it cannot itself flicker.
    */
    defaultPendingMs: 250,
    defaultPendingMinMs: 400,
    defaultPendingComponent: RoutePending,
  });

  return router;
};
