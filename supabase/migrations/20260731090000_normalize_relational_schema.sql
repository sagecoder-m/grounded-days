-- Normalize the single-blob grounded_state document into relational tables.
--
-- Every table is scoped by user_id with RLS, matching the policy style of the
-- original grounded_state migration. public.update_updated_at_column() already
-- exists (created with CREATE OR REPLACE), so tables with an updated_at column
-- just attach a trigger to it.
--
-- Design notes:
--   * area/status/density/accent/default_cal_view are text + CHECK rather than
--     Postgres enums, so they can be extended without an ALTER TYPE migration.
--   * habit_logs uses row presence as truth: a row means "completed that day".
--     The old Habit.log was Record<date, boolean> where an absent key already
--     meant not-done, so presence semantics match exactly.
--   * subprojects and habit_logs carry a denormalized user_id so their RLS
--     policies stay the same one-line auth.uid() = user_id check as every other
--     table, instead of an EXISTS join through the parent on every row.
--   * ON DELETE CASCADE replaces the manual JS cascades that used to live in
--     the store's deleteProject / deleteSubproject actions.

-- ---------------------------------------------------------------- projects

CREATE TABLE public.projects (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projects_user_id_idx ON public.projects (user_id);

-- ------------------------------------------------------------- subprojects

CREATE TABLE public.subprojects (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subprojects_user_id_idx ON public.subprojects (user_id);
CREATE INDEX subprojects_project_id_idx ON public.subprojects (project_id);

-- ------------------------------------------------------------------- tasks

CREATE TABLE public.tasks (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  area text NOT NULL CHECK (area IN ('personal', 'professional', 'education')),
  title text NOT NULL,
  description text,
  date date,
  done boolean NOT NULL DEFAULT false,
  project_id uuid REFERENCES public.projects (id) ON DELETE CASCADE,
  subproject_id uuid REFERENCES public.subprojects (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tasks_user_id_date_idx ON public.tasks (user_id, date);
CREATE INDEX tasks_user_id_area_idx ON public.tasks (user_id, area);
CREATE INDEX tasks_project_id_idx ON public.tasks (project_id);
CREATE INDEX tasks_subproject_id_idx ON public.tasks (subproject_id);

-- ------------------------------------------------------------------- goals

CREATE TABLE public.goals (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  area text NOT NULL CHECK (area IN ('personal', 'professional', 'education')),
  name text NOT NULL,
  description text,
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  project_id uuid REFERENCES public.projects (id) ON DELETE CASCADE,
  subproject_id uuid REFERENCES public.subprojects (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX goals_user_id_area_idx ON public.goals (user_id, area);
CREATE INDEX goals_project_id_idx ON public.goals (project_id);
CREATE INDEX goals_subproject_id_idx ON public.goals (subproject_id);

-- ------------------------------------------------------------------ habits

CREATE TABLE public.habits (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX habits_user_id_idx ON public.habits (user_id);

-- -------------------------------------------------------------- habit_logs

-- A row means the habit was completed on that date. Toggling off deletes it.
CREATE TABLE public.habit_logs (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  habit_id uuid NOT NULL REFERENCES public.habits (id) ON DELETE CASCADE,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (habit_id, date)
);

CREATE INDEX habit_logs_user_id_date_idx ON public.habit_logs (user_id, date);
CREATE INDEX habit_logs_habit_id_date_idx ON public.habit_logs (habit_id, date);

-- ------------------------------------------------------------------ events

CREATE TABLE public.events (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  date date NOT NULL,
  area text CHECK (area IN ('personal', 'professional', 'education')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX events_user_id_date_idx ON public.events (user_id, date);

-- ---------------------------------------------------------- focus_sessions

CREATE TABLE public.focus_sessions (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  label text NOT NULL,
  minutes integer NOT NULL CHECK (minutes > 0),
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX focus_sessions_user_id_completed_at_idx
  ON public.focus_sessions (user_id, completed_at DESC);

-- ----------------------------------------------------------- user_settings

-- One row per user, so user_id is the primary key (no separate id column).
-- widgets stays jsonb: array position IS the render order, and the list is
-- never queried or joined, so a table with a position column buys nothing.
CREATE TABLE public.user_settings (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'friend',
  density text NOT NULL DEFAULT 'comfy' CHECK (density IN ('compact', 'comfy')),
  accent text NOT NULL DEFAULT 'sage' CHECK (accent IN ('sage', 'clay', 'brown', 'tan')),
  default_cal_view text NOT NULL DEFAULT 'week' CHECK (default_cal_view IN ('week', 'month', 'year')),
  widgets jsonb NOT NULL DEFAULT '[
    {"key": "greeting", "enabled": true},
    {"key": "tasks", "enabled": true},
    {"key": "goals", "enabled": true},
    {"key": "chart", "enabled": true},
    {"key": "calendar", "enabled": true},
    {"key": "upcoming", "enabled": true}
  ]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ grants

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subprojects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.focus_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;

GRANT ALL ON public.projects TO service_role;
GRANT ALL ON public.subprojects TO service_role;
GRANT ALL ON public.tasks TO service_role;
GRANT ALL ON public.goals TO service_role;
GRANT ALL ON public.habits TO service_role;
GRANT ALL ON public.habit_logs TO service_role;
GRANT ALL ON public.events TO service_role;
GRANT ALL ON public.focus_sessions TO service_role;
GRANT ALL ON public.user_settings TO service_role;

-- --------------------------------------------------------------------- RLS

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subprojects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Four policies per table, one per verb, matching the original migration's
-- style. Generated in a loop because the bodies are identical across tables.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'projects', 'subprojects', 'tasks', 'goals', 'habits',
    'habit_logs', 'events', 'focus_sessions', 'user_settings'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY "Users can view their own %1$s" ON public.%1$I
         FOR SELECT TO authenticated USING (auth.uid() = user_id)', t);
    EXECUTE format(
      'CREATE POLICY "Users can insert their own %1$s" ON public.%1$I
         FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format(
      'CREATE POLICY "Users can update their own %1$s" ON public.%1$I
         FOR UPDATE TO authenticated
         USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format(
      'CREATE POLICY "Users can delete their own %1$s" ON public.%1$I
         FOR DELETE TO authenticated USING (auth.uid() = user_id)', t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------- triggers

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subprojects_updated_at BEFORE UPDATE ON public.subprojects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_habits_updated_at BEFORE UPDATE ON public.habits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- grounded_state is intentionally retained as the rollback path for the data
-- migration that follows. It is no longer read or written by the app.
COMMENT ON TABLE public.grounded_state IS
  'Superseded by the relational tables added 2026-07-31. Retained as a migration rollback path; not read by the app.';
