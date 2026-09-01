import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { CalendarDays, Plus } from "lucide-react";

import { actions, useAppState } from "@/lib/store";
import type { CalEvent, Course, Goal, Task } from "@/lib/store-types";
import { TaskRow } from "@/components/task-row";
import { dateKey } from "@/lib/dates";
import { GoalFocus } from "@/components/goal-focus";
import { FocusOverlay, ExpandButton } from "@/components/focus-overlay";
import { AddTaskDialog } from "@/components/add-task-dialog";
import { AddGoalDialog } from "@/components/add-goal-dialog";
import { AddCourseDialog } from "@/components/add-course-dialog";
import { InlineText } from "@/components/inline-text";
import { HowFarYouveCome } from "@/components/how-far";
import { newestFirst } from "@/lib/user-insights";
import { ConfirmDeleteButton } from "@/components/confirm-delete";
import { AreaEvents, EventRow } from "@/components/area-events";
import { courseForEvent, courseTag } from "@/lib/course-match";
import { ReorderableCard } from "@/components/reorderable-card";
import { useCardDrag } from "@/lib/use-card-drag";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FocusTimer } from "@/components/focus-timer";
import { SectionNav } from "@/components/section-nav";

/* Reading order on a phone, which is the order the column stacks in: what is
   on today, then the week, then the courses and goals behind them. */
const SECTIONS = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "courses", label: "Courses" },
  { id: "goals", label: "Goals" },
];

export const Route = createFileRoute("/education")({
  component: EducationPage,
});

/** How far "due this week" looks. Seven days is the horizon a term actually
 *  runs on, and it is short enough that the list stays a list. */
const WEEK_AHEAD = 7;

/**
 * Study, laid out the way the brief draws it.
 *
 * Two columns rather than one long scroll. The left is where the work lives —
 * the timer you start a block with, the courses that work is filed under, and
 * the history at the bottom. The right is the answer to "what now": what is due
 * today, what is due this week, and the goals sitting behind all of it.
 *
 * The split matters more than it looks. Courses are a filing structure and you
 * go to them on purpose; due dates are a demand and they should be visible
 * without going anywhere. Stacked in one column the demands were below the
 * filing, which is the wrong way round.
 */
function EducationPage() {
  const state = useAppState();
  const goals = state.goals.filter((g) => g.area === "education");
  const tasks = useMemo(() => state.tasks.filter((t) => t.area === "education"), [state.tasks]);
  const courses = state.courses;

  const today = dateKey(new Date());
  /*
    Synced classes included. This said "local only", because a Google or Outlook
    event used to carry no area — which stopped being true when connections
    gained a default area and the sync started stamping it on every row. On this
    page that exclusion was the whole problem: lectures come from the
    university's calendar, so Today listed assignments and never a class.
  */
  const todaysEvents = useMemo(
    () => state.events.filter((e) => e.area === "education" && e.date === today),
    [state.events, today],
  );
  const courseDrag = useCardDrag();
  const goalDrag = useCardDrag();

  /** What is open full screen, if anything. */
  const [focusCourse, setFocusCourse] = useState<string | null>(null);
  const [focusGoal, setFocusGoal] = useState<string | null>(null);
  const openCourse = courses.find((c) => c.id === focusCourse) ?? null;
  const openGoal = goals.find((g) => g.id === focusGoal) ?? null;

  return (
    <div className="space-y-8">
      <header>
        <p className="chip" style={{ backgroundColor: "var(--clay-soft)", color: "var(--clay)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--clay)" }} />{" "}
          Education
        </p>
        <h1 className="mt-3 font-serif text-2xl md:text-3xl">Learn at your own pace</h1>
        <p className="mt-2 max-w-lg text-ink-soft">
          Courses hold your assignments. Everything with a date also lands on your calendar.
        </p>
      </header>

      {/* Phone only — see SectionNav. On a wide screen these four sit in two
          columns and are taken in at once; stacked, Due this week is four
          scrolls past Courses. */}
      <SectionNav sections={SECTIONS} />

      <div className="grid gap-8 @3xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          {/* First on the page, because on a study page the first useful action
              is usually "start a block", not "read the list". */}
          <FocusTimer size="medium" />

          <section
            id="courses"
            className="scroll-mt-36"
            onPointerUp={courseDrag.endDrag}
            onPointerLeave={courseDrag.endDrag}
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-lg">Courses</h2>
              <AddCourseDialog
                trigger={
                  <button className="flex items-center gap-1 text-xs text-ink-soft underline underline-offset-4 hover:text-ink">
                    <Plus className="h-3.5 w-3.5" /> Course
                  </button>
                }
              />
            </div>

            {courses.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm italic text-ink-soft">
                No courses yet. Add one and its assignments live inside it.
              </p>
            ) : (
              <div className="grid gap-3 @xl:grid-cols-2">
                {courses.map((course) => (
                  <ReorderableCard
                    key={course.id}
                    id={course.id}
                    collection="courses"
                    orderedIds={courses.map((c) => c.id)}
                    drag={courseDrag.drag}
                    setDrag={courseDrag.setDrag}
                  >
                    <CourseCard
                      course={course}
                      tasks={tasks}
                      onExpand={() => setFocusCourse(course.id)}
                    />
                  </ReorderableCard>
                ))}
              </div>
            )}
          </section>

          <HowFarYouveCome
            storageKey="grounded.education.history"
            groups={[{ id: "all", tasks: newestFirst(tasks.filter((t) => t.done)) }]}
            sessions={state.focusSessions}
            blurb="Everything you have finished, and every block you have sat through."
          />
        </div>

        <div className="space-y-8">
          <Today tasks={tasks} events={todaysEvents} courses={courses} today={today} />
          <DueThisWeek tasks={tasks} today={today} />
          <AreaEvents area="education" excludeToday />

          <section
            id="goals"
            className="scroll-mt-36"
            onPointerUp={goalDrag.endDrag}
            onPointerLeave={goalDrag.endDrag}
          >
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="font-serif text-lg">Goals</h2>
              <AddGoalDialog
                area="education"
                trigger={
                  <button className="flex items-center gap-1 text-xs text-ink-soft underline underline-offset-4 hover:text-ink">
                    <Plus className="h-3.5 w-3.5" /> Goal
                  </button>
                }
              />
            </div>

            {goals.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs italic text-ink-soft">
                No goals yet.
              </p>
            ) : (
              <div className="space-y-2">
                {goals.map((g) => (
                  <ReorderableCard
                    key={g.id}
                    id={g.id}
                    collection="goals"
                    orderedIds={goals.map((x) => x.id)}
                    drag={goalDrag.drag}
                    setDrag={goalDrag.setDrag}
                  >
                    <GoalPill goal={g} onOpen={() => setFocusGoal(g.id)} />
                  </ReorderableCard>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {openCourse && (
        <CourseFocus course={openCourse} tasks={tasks} onClose={() => setFocusCourse(null)} />
      )}
      {openGoal && (
        <GoalFocus goal={openGoal} eyebrow="Education" onClose={() => setFocusGoal(null)} />
      )}
    </div>
  );
}

/**
 * Today, on the page rather than in a panel — assignments due, and anything
 * on the calendar for education that is actually happening today.
 *
 * The brief marks this one "transparent", and the word is doing real work: this
 * is the list you glance at, so it should read as writing on the page rather
 * than as another box competing with the boxes around it.
 *
 * Events lead the list rather than trailing it. A lecture at 10am is a fixed
 * point the day has to bend around; an assignment is due whenever you get to
 * it today, which is a softer kind of commitment — see today-glance.tsx's
 * AgendaRow for the same ordering on the Overview.
 */
function Today({
  tasks,
  events,
  courses,
  today,
}: {
  tasks: Task[];
  events: CalEvent[];
  courses: Course[];
  today: string;
}) {
  // Which course each row belongs to. An assignment knows its own; a class has
  // to be read out of the title it was synced with — see courseForEvent.
  const byId = new Map(courses.map((c) => [c.id, c]));
  const due = tasks.filter((t) => t.date === today || (!t.done && t.date && t.date < today));
  const open = due.filter((t) => !t.done);
  const timed = events
    .filter((e) => !e.allDay && e.startsAt)
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
  const allDay = events.filter((e) => e.allDay || !e.startsAt);
  const nothing = due.length === 0 && events.length === 0;

  return (
    <section id="today" className="scroll-mt-36">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">Today</h2>
        <Link
          to="/calendar"
          className="inline-flex items-center gap-1.5 text-xs text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Timeline
        </Link>
      </div>

      {nothing ? (
        <p className="text-sm italic text-ink-soft">Nothing due today.</p>
      ) : (
        <div className="space-y-1">
          {timed.map((e) => (
            <EventRow key={e.id} event={e} today={today} course={tagFor(e, courses)} />
          ))}
          {allDay.map((e) => (
            <EventRow key={e.id} event={e} today={today} course={tagFor(e, courses)} />
          ))}
          {open.map((t) => (
            <LineItem key={t.id} task={t} today={today} course={courseLabel(t, byId)} />
          ))}
          {due
            .filter((t) => t.done)
            .map((t) => (
              <LineItem key={t.id} task={t} today={today} course={courseLabel(t, byId)} />
            ))}
        </div>
      )}
    </section>
  );
}

/** The course a class is for, or nothing. Read from the title, never guessed. */
function tagFor(event: CalEvent, courses: Course[]): string | undefined {
  const match = courseForEvent(event.title, courses);
  return match ? courseTag(match) : undefined;
}

/** The course an assignment is filed under. This one is certain — the task
 *  carries the id — so it needs no matching. */
function courseLabel(task: Task, byId: Map<string, Course>): string | undefined {
  if (!task.courseId) return undefined;
  const course = byId.get(task.courseId);
  return course ? courseTag(course) : undefined;
}

/** One assignment as a line, not a card. Checkbox, title, and the date only when
 *  it is telling you something you did not already know. */
function LineItem({ task, today, course }: { task: Task; today: string; course?: string }) {
  const late = Boolean(task.date && task.date < today && !task.done);
  return (
    <div className="flex items-baseline gap-2.5 py-1">
      <Checkbox
        checked={task.done}
        onCheckedChange={() => actions.toggleTask(task.id)}
        className="h-4 w-4 shrink-0 rounded border-tan data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      />
      <span
        className={`min-w-0 flex-1 text-sm ${
          task.done ? "text-ink-soft line-through decoration-1" : ""
        }`}
      >
        {task.title}
      </span>
      {/* Which course this is for. The single most useful thing to add to a
          list of assignments, and the thing a page of six of them was missing:
          "Problem set 3" says nothing on its own in a term with four courses. */}
      {course && (
        <span className="chip shrink-0 bg-clay-soft text-[11px] text-[color:var(--clay)]">
          {course}
        </span>
      )}
      {late && task.date && (
        <span className="shrink-0 text-[11px] text-[color:var(--clay)]">
          {format(parseISO(task.date), "MMM d")}
        </span>
      )}
    </div>
  );
}

/** The next seven days, today excluded — today has its own list directly above
 *  and repeating it there reads as twice the work. */
function DueThisWeek({ tasks, today }: { tasks: Task[]; today: string }) {
  const to = dateKey(addDays(parseISO(today), WEEK_AHEAD));
  const due = tasks
    .filter((t) => !t.done && t.date && t.date > today && t.date <= to)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  return (
    <section id="week" className="scroll-mt-36">
      <h2 className="mb-3 font-serif text-lg">Due this week</h2>
      {due.length === 0 ? (
        <p className="text-sm italic text-ink-soft">A clear week ahead.</p>
      ) : (
        <div className="space-y-1">
          {due.map((t) => (
            <div key={t.id} className="flex items-baseline gap-2.5 py-1">
              <span className="w-12 shrink-0 text-[11px] text-ink-soft">
                {t.date && format(parseISO(t.date), "EEE d")}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** A goal as one line you can open. Same destination as a Professional goal —
 *  the full-screen step list — so the gesture means one thing in both places. */
function GoalPill({ goal, onOpen }: { goal: Goal; onOpen: () => void }) {
  const done = goal.steps.filter((s) => s.done).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="float-row flex w-full items-center justify-between gap-3 rounded-full border border-border bg-card px-5 py-2.5 text-left"
    >
      <span className="min-w-0 flex-1 truncate text-sm">{goal.name}</span>
      {goal.steps.length > 0 && (
        <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">
          {done}/{goal.steps.length}
        </span>
      )}
    </button>
  );
}

/**
 * One course: what is outstanding, and the way into the whole of it.
 *
 * The card is deliberately a summary now. It used to list every assignment
 * inline, which made four courses into four lists on a page that already had
 * two more — the expand arrow exists precisely so the detail has somewhere else
 * to be.
 */
function CourseCard({
  course,
  tasks,
  onExpand,
}: {
  course: Course;
  tasks: Task[];
  onExpand: () => void;
}) {
  const mine = tasks.filter((t) => t.courseId === course.id);
  const outstanding = mine.filter((t) => !t.done);

  return (
    // "group" was missing here: the delete button below is a .reveal-control,
    // which is invisible and unclickable on a mouse until a "group" ancestor
    // is hovered. Without it the button existed but could never be reached —
    // which is the whole bug reported: courses could not be deleted at all.
    <div className="group card-soft flex h-full flex-col gap-3 p-4 pr-10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <InlineText
            value={course.name}
            onSave={(v) => v && actions.updateCourse(course.id, { name: v })}
            showIcon
            className="font-serif text-base leading-tight"
          />
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-soft">
            {course.code && <span>{course.code}</span>}
            {course.term && <span>{course.term}</span>}
          </div>
        </div>
        <ExpandButton onClick={onExpand} label={`Open ${course.name}`} />
      </div>

      {/* The three nearest pieces of work, then a count. Enough to know whether
          this course needs you today without becoming the list again. */}
      <div className="flex-1 space-y-1">
        {outstanding.length === 0 ? (
          <p className="text-xs italic text-ink-soft">
            {mine.length === 0 ? "No assignments yet" : "All caught up"}
          </p>
        ) : (
          <>
            {outstanding.slice(0, 3).map((t) => (
              <p key={t.id} className="truncate text-xs text-ink-soft">
                {t.title}
              </p>
            ))}
            {outstanding.length > 3 && (
              <p className="text-xs text-ink-soft">+{outstanding.length - 3} more</p>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between">
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
        <ConfirmDeleteButton
          itemLabel={course.name}
          consequence="Its assignments stay, unfiled."
          onConfirm={() => actions.deleteCourse(course.id)}
          className="reveal-control text-ink-soft transition-colors hover:text-[color:var(--clay)]"
          iconClassName="h-3.5 w-3.5"
          aria-label={`Remove ${course.name}`}
        />
      </div>
    </div>
  );
}

/** The whole course, full screen: every assignment, outstanding first. */
function CourseFocus({
  course,
  tasks,
  onClose,
}: {
  course: Course;
  tasks: Task[];
  onClose: () => void;
}) {
  const mine = tasks.filter((t) => t.courseId === course.id);
  const outstanding = mine.filter((t) => !t.done);
  const done = mine.filter((t) => t.done);

  return (
    <FocusOverlay
      title={course.name}
      eyebrow={[course.code, course.term].filter(Boolean).join(" · ") || "Course"}
      onClose={onClose}
      footer={
        <AddTaskDialog
          area="education"
          courseId={course.id}
          trigger={
            <button className="inline-flex items-center gap-1.5 text-sm text-ink-soft underline underline-offset-4 hover:text-ink">
              <Plus className="h-4 w-4" /> Assignment
            </button>
          }
        />
      }
    >
      {mine.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm italic text-ink-soft">
          Nothing filed under this course yet.
        </p>
      ) : (
        <div className="space-y-2">
          {outstanding.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              showArea={false}
              floating
              onDelete={() => actions.deleteTask(t.id)}
            />
          ))}
          {done.length > 0 && (
            <p className="px-1 pt-4 text-[11px] uppercase tracking-[0.08em] text-ink-soft">Done</p>
          )}
          {done.map((t) => (
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
    </FocusOverlay>
  );
}
