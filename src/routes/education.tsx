import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays, ChevronRight, Plus, Trash2 } from "lucide-react";

import { actions, useAppState } from "@/lib/store";
import type { Course, Task } from "@/lib/store-types";
import { TaskRow } from "@/components/task-row";
import { TaskGrid, dateKey } from "@/components/task-grid";
import { GoalCard } from "@/components/goal-card";
import { AddTaskDialog } from "@/components/add-task-dialog";
import { AddGoalDialog } from "@/components/add-goal-dialog";
import { AddCourseDialog } from "@/components/add-course-dialog";
import { InlineText } from "@/components/inline-text";
import { ReorderableCard, useCardDrag } from "@/components/reorderable-card";
import { Button } from "@/components/ui/button";
import { FocusTimer } from "@/components/focus-timer";

export const Route = createFileRoute("/education")({
  component: EducationPage,
});

function EducationPage() {
  const state = useAppState();
  const goals = state.goals.filter((g) => g.area === "education");
  const tasks = state.tasks.filter((t) => t.area === "education");
  const courses = state.courses;

  const today = dateKey(new Date());
  const history = tasks
    .filter((t) => t.done)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const courseDrag = useCardDrag();
  const goalDrag = useCardDrag();

  return (
    <div className="space-y-10">
      <header>
        <p className="chip" style={{ backgroundColor: "var(--clay-soft)", color: "var(--clay)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--clay)" }} />{" "}
          Education
        </p>
        <h1 className="mt-3 font-serif text-2xl md:text-3xl">Learn at your own pace</h1>
        <p className="mt-2 max-w-lg text-ink-soft">
          Courses hold your assignments. Everything with a date also lands on your
          calendar.
        </p>
      </header>

      {/* Above the work, deliberately: on a study page the first useful action
          is usually "start a block", not "read the list". Medium rather than
          full size so it leads without dominating. */}
      <FocusTimer size="medium" />

      {/* Replaces the old "To do" list. Assignments are tasks, so this is the
          same grid the Overview uses — one component, one behaviour, and a
          course's work shows up here automatically because it carries a date. */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg">Due today</h2>
          <Link
            to="/calendar"
            className="inline-flex items-center gap-1.5 text-xs text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            See the whole timeline
          </Link>
        </div>
        <TaskGrid
          tasks={tasks}
          from={today}
          to={today}
          emptyText="Nothing due today. Use the timeline to look further ahead."
          showAdd={false}
          includeOverdue
        />
      </section>

      <section onPointerUp={courseDrag.endDrag} onPointerLeave={courseDrag.endDrag}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg">Courses</h2>
          <AddCourseDialog
            trigger={
              <Button variant="outline" size="sm" className="rounded-full border-tan">
                <Plus className="h-3.5 w-3.5" /> Course
              </Button>
            }
          />
        </div>

        {courses.length === 0 ? (
          <div className="card-soft p-6 text-center text-sm italic text-ink-soft">
            No courses yet. Add one and its assignments live inside it.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {courses.map((course) => (
              <ReorderableCard
                key={course.id}
                id={course.id}
                collection="courses"
                orderedIds={courses.map((c) => c.id)}
                drag={courseDrag.drag}
                setDrag={courseDrag.setDrag}
              >
                <CourseCard course={course} tasks={tasks} />
              </ReorderableCard>
            ))}
          </div>
        )}
      </section>

      <section onPointerUp={goalDrag.endDrag} onPointerLeave={goalDrag.endDrag}>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-serif text-lg">Goals</h2>
          <AddGoalDialog
            area="education"
            trigger={
              <Button variant="outline" size="sm" className="rounded-full border-tan">
                <Plus className="h-3.5 w-3.5" /> Goal
              </Button>
            }
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((g) => (
            <ReorderableCard
              key={g.id}
              id={g.id}
              collection="goals"
              orderedIds={goals.map((x) => x.id)}
              drag={goalDrag.drag}
              setDrag={goalDrag.setDrag}
            >
              <GoalCard goal={g} tint="clay" />
            </ReorderableCard>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg">History</h2>
          <span className="text-xs text-ink-soft">
            {history.length} completed · {state.focusSessions.length} focus sessions
          </span>
        </div>
        {/* The point of this section, said plainly. Everything above is what is
            left to do; this is the only place that looks backwards. */}
        <p className="mb-3 text-sm italic text-ink-soft">
          I want to show you how far you&rsquo;ve come.
        </p>
        <div className="space-y-2">
          {history.length === 0 && state.focusSessions.length === 0 && (
            <div className="card-soft p-6 text-center text-sm italic text-ink-soft">
              Your completed work will collect here.
            </div>
          )}
          {history.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 opacity-80"
            >
              <div>
                <div className="text-sm line-through decoration-1">{t.title}</div>
                {t.description && <div className="text-xs text-ink-soft">{t.description}</div>}
              </div>
              <div className="text-[11px] text-ink-soft">
                {t.date && format(parseISO(t.date), "MMM d")}
              </div>
            </div>
          ))}
          {state.focusSessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className="chip"
                  style={{ backgroundColor: "var(--clay-soft)", color: "var(--clay)" }}
                >
                  Focus
                </div>
                <div className="text-sm">{s.label}</div>
              </div>
              <div className="text-[11px] text-ink-soft">
                {s.minutes} min · {format(new Date(s.completedAt), "MMM d")}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * One course and the assignments filed under it.
 *
 * Assignments are education tasks carrying this course's id, so they are the
 * same TaskRow used everywhere else — check off, rename, re-date, delete — and
 * they appear on the calendar and in "Due today" without this card doing
 * anything to put them there.
 */
function CourseCard({ course, tasks }: { course: Course; tasks: Task[] }) {
  const [open, setOpen] = useState(true);
  const mine = tasks.filter((t) => t.courseId === course.id);
  const outstanding = mine.filter((t) => !t.done);
  const done = mine.filter((t) => t.done);

  return (
    <div className="card-soft space-y-3 p-5 pr-10">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <InlineText
          value={course.name}
          onSave={(v) => v && actions.updateCourse(course.id, { name: v })}
          showIcon
          className="font-serif text-lg"
        />
        {course.code && <span className="text-xs text-ink-soft">{course.code}</span>}
        {course.term && (
          <span className="chip bg-secondary text-[10px] text-ink-soft">{course.term}</span>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-ink-soft">
        <span>
          {outstanding.length === 0
            ? mine.length === 0
              ? "No assignments yet"
              : "All assignments done"
            : `${outstanding.length} outstanding`}
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 underline underline-offset-4 transition-colors hover:text-ink"
          aria-expanded={open}
        >
          {open ? "Hide" : "Show"}
          <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="space-y-2">
          {outstanding.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              showArea={false}
              onDelete={() => actions.deleteTask(t.id)}
            />
          ))}
          {done.length > 0 && (
            <p className="px-1 pt-1 text-[11px] uppercase tracking-[0.08em] text-ink-soft">
              Done
            </p>
          )}
          {done.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              showArea={false}
              onDelete={() => actions.deleteTask(t.id)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <AddTaskDialog
          area="education"
          courseId={course.id}
          trigger={
            <button className="inline-flex items-center gap-1.5 text-xs text-ink-soft transition-colors hover:text-ink">
              <Plus className="h-3.5 w-3.5" /> Assignment
            </button>
          }
        />
        {/* Deleting a course keeps its assignments — the foreign key sets their
            course_id to null rather than cascading. */}
        <button
          onClick={() => actions.deleteCourse(course.id)}
          className="text-ink-soft transition-colors hover:text-[color:var(--clay)]"
          aria-label={`Remove ${course.name}. Its assignments stay.`}
          title="Remove course — assignments stay"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
