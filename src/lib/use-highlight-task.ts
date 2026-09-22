import { useEffect, useState } from "react";

/**
 * Scrolls to and briefly marks the task named by `?taskId=` in the URL — how
 * a tap on a task-due or morning-line notification lands on the specific
 * task it was about, not just the right page.
 *
 * Reads the URL directly rather than through a route's typed search schema,
 * so it drops into any of the three area pages (personal, education,
 * professional/$projectId) without touching their existing routing.
 */
export function useHighlightTask(): string | null {
  const [highlighted, setHighlighted] = useState<string | null>(null);

  useEffect(() => {
    const taskId = new URLSearchParams(window.location.search).get("taskId");
    if (!taskId) return;

    // The task list for a freshly loaded page renders a beat after mount;
    // give it that beat before searching the DOM for the row.
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`task-${taskId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlighted(taskId);

      // Stripped once found, so refreshing the page does not re-scroll and
      // re-highlight the same row every time.
      const url = new URL(window.location.href);
      url.searchParams.delete("taskId");
      window.history.replaceState({}, "", url);
    }, 150);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!highlighted) return;
    const timer = window.setTimeout(() => setHighlighted(null), 2500);
    return () => window.clearTimeout(timer);
  }, [highlighted]);

  return highlighted;
}
