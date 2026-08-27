import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Pause, Play, Plus, Trash2 } from "lucide-react";

import { actions, useAppState } from "@/lib/store";
import { areaProjectProgress, lastProjectId, projectProgress } from "@/lib/project-progress";
import { ReorderableCard, useCardDrag } from "@/components/reorderable-card";
import { AddProjectDialog } from "@/components/add-project-dialog";
import { SoftProgress } from "@/components/soft-progress";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/professional/")({
  component: ProfessionalPage,
});

/**
 * Work, as a shelf of projects rather than one long page.
 *
 * This page used to be everything at once: every project expanded, every
 * sub-project inside it, every goal and task inside those, all on one scroll.
 * The note in the brief is one word — "concern: long" — and it is the right
 * concern. A page that shows you all of your work is a page you cannot start
 * anywhere on.
 *
 * So it is a folder now, in the brief's own words a "google drive vibe". This
 * page answers one question: which project am I in? Everything else is a click
 * deeper, and each click narrows what you can see — project, then sub-project,
 * then a single goal filling the screen. The depth is the feature.
 */
function ProfessionalPage() {
  const state = useAppState();
  const projects = state.projects.filter((p) => p.area === "professional");
  const drag = useCardDrag();

  return (
    <div className="space-y-8">
      {/* The banner. Its wording is untouched by design — the brief marks this
          area "info already there, don't change". */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p
            className="chip"
            style={{ backgroundColor: "var(--brown-soft)", color: "var(--brown)" }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: "var(--brown)" }}
            />{" "}
            Professional
          </p>
          <h1 className="mt-3 font-serif text-2xl md:text-3xl">Your work, organized softly</h1>
          <p className="mt-2 max-w-lg text-ink-soft">
            Projects hold sub-projects, which hold goals and tasks. Roll it up when it&rsquo;s too
            much.
          </p>
        </div>
        <AddProjectDialog
          area="professional"
          trigger={
            <Button className="rounded-full">
              <Plus className="h-4 w-4" /> New project
            </Button>
          }
        />
      </header>

      <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div
          className="space-y-3"
          onPointerUp={drag.endDrag}
          onPointerLeave={drag.endDrag}
        >
          {projects.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm italic text-ink-soft">
              No projects yet. One is enough to begin with.
            </p>
          ) : (
            projects.map((p) => (
              <ReorderableCard
                key={p.id}
                id={p.id}
                collection="projects"
                orderedIds={projects.map((x) => x.id)}
                drag={drag.drag}
                setDrag={drag.setDrag}
              >
                <ProjectRow project={p} />
              </ReorderableCard>
            ))
          )}
        </div>

        <WhereYouLeftOff />
      </div>
    </div>
  );
}

/**
 * One project, as a row you click into.
 *
 * The name is the link, which is what the brief asks for — and the rest of the
 * row is deliberately not, so the pause and delete controls beside it cannot be
 * hit on the way to opening something.
 */
function ProjectRow({ project }: { project: ReturnType<typeof useAppState>["projects"][number] }) {
  const state = useAppState();
  const paused = project.status === "paused";
  const progress = projectProgress(state, project);
  const subCount = project.subprojects.length;

  return (
    <div
      className={`float-row flex flex-wrap items-center gap-4 rounded-2xl border bg-card px-5 py-4 ${
        paused ? "border-dashed border-tan" : "border-border"
      }`}
    >
      <div className="min-w-0 flex-1">
        <Link
          to="/professional/$projectId"
          params={{ projectId: project.id }}
          className="group/name inline-flex items-center gap-1.5 font-serif text-xl leading-tight hover:underline underline-offset-4"
        >
          {project.name}
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft transition-transform group-hover/name:translate-x-0.5" />
        </Link>
        <p className="mt-0.5 truncate text-xs text-ink-soft">
          {project.description?.trim() ||
            `${subCount} ${subCount === 1 ? "sub-project" : "sub-projects"}`}
        </p>
      </div>

      <div className="w-32 shrink-0">
        <SoftProgress value={progress} tint={paused ? "tan" : "brown"} />
        <div className="mt-1 text-right text-[10px] tabular-nums text-ink-soft">{progress}%</div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => actions.updateProject(project.id, { status: paused ? "active" : "paused" })}
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-secondary hover:text-ink"
          aria-label={paused ? "Resume project" : "Pause project"}
          title={paused ? "Resume" : "Pause"}
        >
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => actions.deleteProject(project.id)}
          className="reveal-control grid h-8 w-8 place-items-center rounded-lg text-ink-soft hover:text-[color:var(--clay)]"
          aria-label="Delete project"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * The way back into what you were doing.
 *
 * Two things, both drawn in the brief: how the work is going overall, and the
 * door back to the project you were last inside. The second is the one that
 * earns its place — the cost of a folder structure is that resuming takes three
 * clicks, and this pays that back.
 */
function WhereYouLeftOff() {
  const state = useAppState();
  const projects = state.projects.filter((p) => p.area === "professional");
  const overall = areaProjectProgress(state, projects);

  // Read after mount: it comes from this device's storage, which the server
  // knows nothing about, and reading it during render would differ between the
  // two.
  const [lastId, setLastId] = useState<string | null>(null);
  useEffect(() => setLastId(lastProjectId()), []);
  const last = projects.find((p) => p.id === lastId);

  return (
    <aside className="card-soft h-fit space-y-4 p-5">
      <div>
        <h2 className="font-serif text-lg">Where you left off</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Across {projects.length} {projects.length === 1 ? "project" : "projects"}.
        </p>
      </div>

      <div>
        <SoftProgress value={overall} tint="brown" />
        <div className="mt-1 text-right text-[11px] tabular-nums text-ink-soft">{overall}%</div>
      </div>

      {last ? (
        <Link
          to="/professional/$projectId"
          params={{ projectId: last.id }}
          className="float-row block rounded-2xl border border-border bg-background px-4 py-3"
        >
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-soft">Last open</p>
          <p className="mt-1 font-serif text-base leading-tight">{last.name}</p>
        </Link>
      ) : (
        <p className="text-xs leading-relaxed text-ink-soft">
          Open a project and it will wait for you here.
        </p>
      )}
    </aside>
  );
}
