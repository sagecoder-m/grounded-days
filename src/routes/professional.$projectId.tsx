import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";

import { actions, useAppState } from "@/lib/store";
import type { Goal, Project, Subproject } from "@/lib/store-types";
import { projectProgress, rememberProject } from "@/lib/project-progress";
import { InlineText } from "@/components/inline-text";
import { TaskRow } from "@/components/task-row";
import { GoalFocus } from "@/components/goal-focus";
import { SoftProgress } from "@/components/soft-progress";
import { AddTaskDialog } from "@/components/add-task-dialog";
import { AddGoalDialog } from "@/components/add-goal-dialog";
import { ConfirmDeleteButton } from "@/components/confirm-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/professional/$projectId")({
  component: ProjectPage,
});

/**
 * The most goals a sub-project will hold.
 *
 * Six, straight from the brief, and it is a limit rather than a shortage. A
 * sub-project is meant to be a thing you can hold in your head; the moment it
 * has fifteen goals it has stopped being one and wants splitting. The cap makes
 * that decision visible at the point it needs making instead of letting the list
 * quietly become another long page — which is the thing this whole restructure
 * exists to prevent.
 */
const MAX_GOALS_PER_SUBPROJECT = 6;

function ProjectPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const state = useAppState();
  const project = state.projects.find((p) => p.id === projectId);

  /*
    Only once the project is known to exist, so a stale link does not become the
    thing you are sent back to.
    
    The id is pulled out rather than reaching through `project` inside the
    effect: the effect genuinely only depends on the id, and written that way
    the dependency list says so instead of listing one thing and using another.
  */
  const rememberedId = project?.id;
  useEffect(() => {
    if (rememberedId) rememberProject(rememberedId);
  }, [rememberedId]);

  /** Which sub-project is open, and which goal is filling the screen. */
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [focusGoal, setFocusGoal] = useState<string | null>(null);

  if (!project) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-serif text-2xl">That project isn&rsquo;t here</h1>
        <p className="mt-2 text-sm text-ink-soft">
          It may have been deleted, or the link may be from another account.
        </p>
        <Button
          onClick={() => navigate({ to: "/professional" })}
          variant="outline"
          className="mt-6 rounded-full border-tan"
        >
          Back to your projects
        </Button>
      </div>
    );
  }

  const progress = projectProgress(state, project);
  const sub = project.subprojects.find((s) => s.id === openSub) ?? null;
  const goal = state.goals.find((g) => g.id === focusGoal) ?? null;

  return (
    <div className="space-y-8">
      <header>
        <Link
          to="/professional"
          className="inline-flex items-center gap-1.5 text-xs text-ink-soft underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All projects
        </Link>

        {/*
          Same bug as the project row on the shelf page, same fix: stacked
          below @sm rather than flex-wrap, which centered the progress block
          against the vertical middle of a title that had wrapped to two
          lines — the bar floated beside the second title line on a phone
          instead of sitting under the whole title the way it does on desktop.
        */}
        <div className="mt-3 flex flex-col gap-3 @sm:flex-row @sm:items-end @sm:justify-between @sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="font-serif text-2xl md:text-3xl">
              <InlineText
                value={project.name}
                onSave={(v) => v && actions.updateProject(project.id, { name: v })}
                showIcon
              />
            </div>
            <InlineText
              value={project.description ?? ""}
              placeholder="Add a description…"
              multiline
              onSave={(v) => actions.updateProject(project.id, { description: v || undefined })}
              className="mt-1 text-sm text-ink-soft"
            />
          </div>
          <div className="w-40 shrink-0">
            <SoftProgress value={progress} tint="brown" />
            <div className="mt-1 text-right text-[11px] tabular-nums text-ink-soft">
              {progress}%
            </div>
          </div>
        </div>
      </header>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg">Sub-projects</h2>
        </div>

        {/* A grid of doors rather than a stack of open drawers. Choosing one is
            the only thing to do here. */}
        <div className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
          {project.subprojects.map((s) => (
            <SubprojectCard
              key={s.id}
              project={project}
              subproject={s}
              open={s.id === openSub}
              onOpen={() => setOpenSub(s.id === openSub ? null : s.id)}
            />
          ))}
          <AddSubprojectCard projectId={project.id} />
        </div>
      </section>

      {sub && (
        <SubprojectPanel
          project={project}
          subproject={sub}
          onFocusGoal={setFocusGoal}
          onClose={() => setOpenSub(null)}
        />
      )}

      {goal && (
        <GoalFocus
          goal={goal}
          eyebrow={[project.name, sub?.name].filter(Boolean).join(" · ")}
          onClose={() => setFocusGoal(null)}
        />
      )}
    </div>
  );
}

function SubprojectCard({
  project,
  subproject,
  open,
  onOpen,
}: {
  project: Project;
  subproject: Subproject;
  open: boolean;
  onOpen: () => void;
}) {
  const state = useAppState();
  const goals = state.goals.filter((g) => g.subprojectId === subproject.id);
  const tasks = state.tasks.filter((t) => t.subprojectId === subproject.id);
  const openTasks = tasks.filter((t) => !t.done).length;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      className={`float-row flex min-h-[6.5rem] flex-col items-start justify-between rounded-2xl border px-4 py-3.5 text-left ${
        open ? "border-primary bg-accent" : "border-border bg-card"
      }`}
    >
      <span className="font-serif text-base leading-tight">{subproject.name}</span>
      <span className="mt-2 text-[11px] text-ink-soft">
        {goals.length === 0 && tasks.length === 0
          ? "Empty for now"
          : [
              goals.length > 0 && `${goals.length} ${goals.length === 1 ? "goal" : "goals"}`,
              openTasks > 0 && `${openTasks} to do`,
            ]
              .filter(Boolean)
              .join(" · ")}
      </span>
      {/* Deleting lives in the open panel, not on the card: a card you are meant
          to click should not carry a destructive control under your thumb. */}
      <span className="sr-only">
        {open ? "Close" : "Open"} {project.name} sub-project
      </span>
    </button>
  );
}

/**
 * The open sub-project: its goals, then its loose tasks.
 *
 * Goals first and as chips, because the brief draws them that way and the shape
 * carries the meaning — six small things you pick one of, not a list you read
 * top to bottom. Tasks sit underneath because they are the work that did not
 * belong to any particular goal.
 */
function SubprojectPanel({
  project,
  subproject,
  onFocusGoal,
  onClose,
}: {
  project: Project;
  subproject: Subproject;
  onFocusGoal: (id: string) => void;
  onClose: () => void;
}) {
  const state = useAppState();
  const goals = state.goals.filter((g) => g.subprojectId === subproject.id);
  const tasks = state.tasks.filter((t) => t.subprojectId === subproject.id);
  const full = goals.length >= MAX_GOALS_PER_SUBPROJECT;

  return (
    <section className="card-soft space-y-5 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-serif text-xl">
            <InlineText
              value={subproject.name}
              onSave={(v) => v && actions.updateSubproject(project.id, subproject.id, { name: v })}
              showIcon
            />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ConfirmDeleteButton
            itemLabel={subproject.name}
            consequence="Its goals and tasks go with it. This cannot be undone."
            onConfirm={() => {
              actions.deleteSubproject(project.id, subproject.id);
              onClose();
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft hover:text-[color:var(--clay)]"
            iconClassName="h-3.5 w-3.5"
            aria-label="Delete sub-project"
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[11px] uppercase tracking-[0.08em] text-ink-soft">Goals</h3>
          {full ? (
            /* Said plainly rather than by a control that has quietly vanished.
               A limit you cannot see is indistinguishable from a bug. */
            <span className="text-[11px] text-ink-soft">
              Six is the most a sub-project holds. Split it if there&rsquo;s more.
            </span>
          ) : (
            <AddGoalDialog
              area="professional"
              projectId={project.id}
              subprojectId={subproject.id}
              trigger={
                <button className="flex items-center gap-1 text-[11px] text-ink-soft underline underline-offset-4 hover:text-ink">
                  <Plus className="h-3 w-3" /> Goal
                </button>
              }
            />
          )}
        </div>

        {goals.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs italic text-ink-soft">
            No goals here yet.
          </p>
        ) : (
          <div className="grid gap-2 @lg:grid-cols-2 @3xl:grid-cols-3">
            {goals.map((g) => (
              <GoalChip key={g.id} goal={g} onOpen={() => onFocusGoal(g.id)} />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[11px] uppercase tracking-[0.08em] text-ink-soft">Tasks</h3>
          <AddTaskDialog
            area="professional"
            projectId={project.id}
            subprojectId={subproject.id}
            trigger={
              <button className="flex items-center gap-1 text-[11px] text-ink-soft underline underline-offset-4 hover:text-ink">
                <Plus className="h-3 w-3" /> Task
              </button>
            }
          />
        </div>

        {tasks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs italic text-ink-soft">
            Nothing loose here.
          </p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                showArea={false}
                floating
                onDelete={() => actions.deleteTask(t.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** A goal as one thing you can pick. The count of steps is the only number on
 *  it — enough to tell a full goal from an empty one at a glance. */
function GoalChip({ goal, onOpen }: { goal: Goal; onOpen: () => void }) {
  const done = goal.steps.filter((s) => s.done).length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="float-row flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-left"
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{goal.name}</span>
      {goal.steps.length > 0 && (
        <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">
          {done}/{goal.steps.length}
        </span>
      )}
    </button>
  );
}

function AddSubprojectCard({ projectId }: { projectId: string }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="flex min-h-[6.5rem] items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border px-4 py-3.5 text-sm text-ink-soft transition-colors hover:border-tan hover:text-ink"
      >
        <Plus className="h-4 w-4" /> Sub-project
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        actions.addSubproject(projectId, name.trim());
        setName("");
        setAdding(false);
      }}
      className="flex min-h-[6.5rem] flex-col justify-center gap-2 rounded-2xl border border-dashed border-border p-3"
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name it"
        aria-label="Sub-project name"
        autoFocus
        onBlur={() => !name.trim() && setAdding(false)}
      />
      <Button type="submit" size="sm" className="rounded-full">
        Add
      </Button>
    </form>
  );
}
