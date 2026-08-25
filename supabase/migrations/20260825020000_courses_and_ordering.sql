-- Courses for the Education area, and a sort order for draggable cards.
--
-- Assignments are tasks with a course_id, not a new entity. That is the whole
-- point of the choice: the calendar, the assistant, the overview, the telemetry
-- and the task grid already understand tasks, so an assignment inherits every
-- one of those for free. A separate "assignments" table would have needed each
-- of those surfaces taught about it, and the two would have drifted.
--
-- It also mirrors how Professional already works — tasks belong to projects and
-- subprojects — so Education gains courses by the same shape rather than a new
-- one.

CREATE TABLE public.courses (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Optional, because "Statistics" is a complete answer and being made to invent
  -- a course code would be friction for no gain.
  code text,
  term text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX courses_user_id_position_idx ON public.courses (user_id, position);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own courses" ON public.courses
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own courses" ON public.courses
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own courses" ON public.courses
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own courses" ON public.courses
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ON DELETE SET NULL, not CASCADE. Dropping a course at the end of a term must
-- not silently delete a term's worth of completed work — the assignments stay
-- and simply become loose education tasks.
ALTER TABLE public.tasks
  ADD COLUMN course_id uuid REFERENCES public.courses (id) ON DELETE SET NULL;

CREATE INDEX tasks_course_id_idx ON public.tasks (course_id);

-- ------------------------------------------------------------------ ordering
--
-- Drag-to-reorder needs somewhere to persist the result. Overview sections had
-- it already (an ordered jsonb array in user_settings); cards did not, because
-- they are rows and rows have no inherent order.

ALTER TABLE public.goals ADD COLUMN position integer NOT NULL DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN position integer NOT NULL DEFAULT 0;
ALTER TABLE public.habits ADD COLUMN position integer NOT NULL DEFAULT 0;

-- Backfill from creation order, so existing cards start in the order they were
-- made rather than an arbitrary one. Without this every position is 0 and the
-- first drag would appear to shuffle everything.
UPDATE public.goals g SET position = s.rn
FROM (SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at) AS rn
        FROM public.goals) s
WHERE g.id = s.id;

UPDATE public.projects p SET position = s.rn
FROM (SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at) AS rn
        FROM public.projects) s
WHERE p.id = s.id;

UPDATE public.habits h SET position = s.rn
FROM (SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at) AS rn
        FROM public.habits) s
WHERE h.id = s.id;
