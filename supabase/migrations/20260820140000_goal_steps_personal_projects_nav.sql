-- UI round: goals become checklists, projects gain an area, navigation becomes
-- a preference, and the Overview leads with progress rather than a task list.

-- ------------------------------------------------------------- goal steps

-- A goal's percentage is now derived from ticking steps off rather than dragging
-- a slider. Dragging asked "how far along do you feel?", which is exactly the
-- judgement call that stalls people; ticking a concrete step answers itself.
CREATE TABLE public.goal_steps (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.goals (id) ON DELETE CASCADE,
  title text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  -- Explicit ordering so steps read as a sequence, not a bag.
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX goal_steps_goal_id_position_idx
  ON public.goal_steps (goal_id, position);
CREATE INDEX goal_steps_user_id_idx ON public.goal_steps (user_id);

ALTER TABLE public.goal_steps ENABLE ROW LEVEL SECURITY;

-- Same four-verb, owner-only shape as every other table in this schema.
CREATE POLICY "Users can view their own goal steps" ON public.goal_steps
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own goal steps" ON public.goal_steps
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own goal steps" ON public.goal_steps
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own goal steps" ON public.goal_steps
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_goal_steps_updated_at BEFORE UPDATE ON public.goal_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- goals.progress is deliberately kept. A goal with no steps yet still has a
-- number the user set by hand, and dropping the column would silently reset
-- every existing goal to zero. Steps win when present; see rowToGoal.
COMMENT ON COLUMN public.goals.progress IS
  'Manual fallback percentage. Ignored once the goal has rows in goal_steps.';

-- ---------------------------------------------------------- project areas

-- Projects were implicitly Professional: the Professional page was the only
-- thing that read them. Defaulting to 'professional' keeps every existing row
-- exactly where it already appears.
ALTER TABLE public.projects
  ADD COLUMN area text NOT NULL DEFAULT 'professional'
    CHECK (area IN ('personal', 'professional', 'education'));

CREATE INDEX projects_user_id_area_idx ON public.projects (user_id, area);

-- ------------------------------------------------------------ navigation

ALTER TABLE public.user_settings
  ADD COLUMN nav_layout text NOT NULL DEFAULT 'sidebar'
    CHECK (nav_layout IN ('sidebar', 'top'));

-- ------------------------------------------------------- overview widgets

-- New default order: progress and the chart come before the task list, so the
-- first thing on screen is movement already made rather than work outstanding.
-- 'minical' is new.
ALTER TABLE public.user_settings ALTER COLUMN widgets SET DEFAULT '[
  {"key": "greeting", "enabled": true},
  {"key": "chart", "enabled": true},
  {"key": "goals", "enabled": true},
  {"key": "tasks", "enabled": true},
  {"key": "minical", "enabled": true},
  {"key": "upcoming", "enabled": true},
  {"key": "calendar", "enabled": false}
]'::jsonb;

-- Existing rows are reordered to match, preserving whatever each key was
-- already set to. A column default alone would only ever reach new accounts,
-- and the reordering is the point of the change.
UPDATE public.user_settings AS us
SET widgets = (
  SELECT jsonb_agg(
           jsonb_build_object(
             'key', k.key,
             'enabled', COALESCE(
               (SELECT (w.value ->> 'enabled')::boolean
                  FROM jsonb_array_elements(us.widgets) AS w
                 WHERE w.value ->> 'key' = k.key),
               -- Unseen keys: 'minical' is new and welcome, the full calendar
               -- board steps aside now that a compact one sits on the Overview.
               k.key <> 'calendar'
             )
           )
           ORDER BY k.ord
         )
    FROM (VALUES
      ('greeting', 1), ('chart', 2), ('goals', 3),
      ('tasks', 4), ('minical', 5), ('upcoming', 6), ('calendar', 7)
    ) AS k(key, ord)
);
