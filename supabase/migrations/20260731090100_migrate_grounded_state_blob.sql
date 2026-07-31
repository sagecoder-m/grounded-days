-- Expand every existing grounded_state.data blob into the relational tables.
--
-- The blob's entity ids are 8-char Math.random() strings, and tasks/goals refer
-- to projects and subprojects by those strings. So this generates the new UUIDs
-- up front into a staging table (rather than relying on column DEFAULTs) and
-- resolves the old -> new links through it.
--
-- Idempotent: grounded_state gains a migrated_at stamp, and only rows where it
-- is NULL are processed. Re-running is a no-op.
--
-- Style note: every set-expanding join is CROSS JOIN LATERAL, never a comma.
-- A comma binds looser than JOIN, so `FROM a, unnest(...) x JOIN m ON m.k = a.k`
-- fails with "invalid reference to FROM-clause entry for table a".

ALTER TABLE public.grounded_state ADD COLUMN IF NOT EXISTS migrated_at timestamptz;

-- Staging table for old-id -> new-uuid resolution. Dropped at the end.
CREATE UNLOGGED TABLE public._grounded_id_map (
  user_id uuid NOT NULL,
  kind text NOT NULL,
  old_id text NOT NULL,
  new_id uuid NOT NULL
);

CREATE INDEX _grounded_id_map_lookup_idx
  ON public._grounded_id_map (user_id, kind, old_id);

-- Only blobs that (a) haven't been migrated and (b) actually hold an object.
CREATE UNLOGGED TABLE public._grounded_pending AS
SELECT gs.user_id, gs.data
FROM public.grounded_state gs
WHERE gs.migrated_at IS NULL
  AND jsonb_typeof(gs.data) = 'object';

-- Helper: safely pull a jsonb array, tolerating missing/non-array keys.
CREATE OR REPLACE FUNCTION public._grounded_arr(blob jsonb, key text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN jsonb_typeof(blob -> key) = 'array' THEN blob -> key
    ELSE '[]'::jsonb
  END;
$$;

-- ------------------------------------------------- 1. id maps (pre-generate)

INSERT INTO public._grounded_id_map (user_id, kind, old_id, new_id)
SELECT p.user_id, 'project', proj ->> 'id', gen_random_uuid()
FROM public._grounded_pending p
CROSS JOIN LATERAL jsonb_array_elements(public._grounded_arr(p.data, 'projects')) AS proj
WHERE proj ->> 'id' IS NOT NULL;

INSERT INTO public._grounded_id_map (user_id, kind, old_id, new_id)
SELECT p.user_id, 'subproject', sub ->> 'id', gen_random_uuid()
FROM public._grounded_pending p
CROSS JOIN LATERAL jsonb_array_elements(public._grounded_arr(p.data, 'projects')) AS proj
CROSS JOIN LATERAL jsonb_array_elements(public._grounded_arr(proj, 'subprojects')) AS sub
WHERE sub ->> 'id' IS NOT NULL;

INSERT INTO public._grounded_id_map (user_id, kind, old_id, new_id)
SELECT p.user_id, 'habit', h ->> 'id', gen_random_uuid()
FROM public._grounded_pending p
CROSS JOIN LATERAL jsonb_array_elements(public._grounded_arr(p.data, 'habits')) AS h
WHERE h ->> 'id' IS NOT NULL;

-- ---------------------------------------------------------- 2. projects tree

INSERT INTO public.projects (id, user_id, name, description, status, created_at)
SELECT
  m.new_id,
  p.user_id,
  COALESCE(NULLIF(proj ->> 'name', ''), 'Untitled project'),
  NULLIF(proj ->> 'description', ''),
  CASE WHEN proj ->> 'status' IN ('active', 'paused', 'done')
       THEN proj ->> 'status' ELSE 'active' END,
  now()
FROM public._grounded_pending p
CROSS JOIN LATERAL jsonb_array_elements(public._grounded_arr(p.data, 'projects')) AS proj
JOIN public._grounded_id_map m
  ON m.user_id = p.user_id AND m.kind = 'project' AND m.old_id = proj ->> 'id';

INSERT INTO public.subprojects (id, user_id, project_id, name, description, created_at)
SELECT
  ms.new_id,
  p.user_id,
  mp.new_id,
  COALESCE(NULLIF(sub ->> 'name', ''), 'Untitled sub-project'),
  NULLIF(sub ->> 'description', ''),
  now()
FROM public._grounded_pending p
CROSS JOIN LATERAL jsonb_array_elements(public._grounded_arr(p.data, 'projects')) AS proj
CROSS JOIN LATERAL jsonb_array_elements(public._grounded_arr(proj, 'subprojects')) AS sub
JOIN public._grounded_id_map mp
  ON mp.user_id = p.user_id AND mp.kind = 'project' AND mp.old_id = proj ->> 'id'
JOIN public._grounded_id_map ms
  ON ms.user_id = p.user_id AND ms.kind = 'subproject' AND ms.old_id = sub ->> 'id';

-- ----------------------------------------------------------------- 3. tasks
-- LEFT JOINs on the id map so unlinked personal/education tasks keep NULL FKs.
-- subproject_id is gated on the project resolving, so a task can never end up
-- pointing at a subproject belonging to a different project.

INSERT INTO public.tasks
  (user_id, area, title, description, date, done, project_id, subproject_id, created_at)
SELECT
  p.user_id,
  CASE WHEN t ->> 'area' IN ('personal', 'professional', 'education')
       THEN t ->> 'area' ELSE 'personal' END,
  COALESCE(NULLIF(t ->> 'title', ''), 'Untitled task'),
  NULLIF(t ->> 'description', ''),
  NULLIF(t ->> 'date', '')::date,
  COALESCE((t ->> 'done')::boolean, false),
  mp.new_id,
  CASE WHEN mp.new_id IS NOT NULL THEN ms.new_id ELSE NULL END,
  COALESCE(to_timestamp(NULLIF(t ->> 'createdAt', '')::bigint / 1000.0), now())
FROM public._grounded_pending p
CROSS JOIN LATERAL jsonb_array_elements(public._grounded_arr(p.data, 'tasks')) AS t
LEFT JOIN public._grounded_id_map mp
  ON mp.user_id = p.user_id AND mp.kind = 'project' AND mp.old_id = t ->> 'projectId'
LEFT JOIN public._grounded_id_map ms
  ON ms.user_id = p.user_id AND ms.kind = 'subproject' AND ms.old_id = t ->> 'subprojectId';

-- ----------------------------------------------------------------- 4. goals
-- Note: seeded goals referenced subproject ids as bare string literals rather
-- than object references, which is exactly why the map is keyed on old_id.

INSERT INTO public.goals
  (user_id, area, name, description, progress, project_id, subproject_id, created_at)
SELECT
  p.user_id,
  CASE WHEN g ->> 'area' IN ('personal', 'professional', 'education')
       THEN g ->> 'area' ELSE 'personal' END,
  COALESCE(NULLIF(g ->> 'name', ''), 'Untitled goal'),
  NULLIF(g ->> 'description', ''),
  LEAST(GREATEST(COALESCE((g ->> 'progress')::numeric, 0)::int, 0), 100),
  mp.new_id,
  CASE WHEN mp.new_id IS NOT NULL THEN ms.new_id ELSE NULL END,
  now()
FROM public._grounded_pending p
CROSS JOIN LATERAL jsonb_array_elements(public._grounded_arr(p.data, 'goals')) AS g
LEFT JOIN public._grounded_id_map mp
  ON mp.user_id = p.user_id AND mp.kind = 'project' AND mp.old_id = g ->> 'projectId'
LEFT JOIN public._grounded_id_map ms
  ON ms.user_id = p.user_id AND ms.kind = 'subproject' AND ms.old_id = g ->> 'subprojectId';

-- -------------------------------------------------------- 5. habits + logs

INSERT INTO public.habits (id, user_id, name, created_at)
SELECT
  m.new_id,
  p.user_id,
  COALESCE(NULLIF(h ->> 'name', ''), 'Untitled habit'),
  COALESCE(to_timestamp(NULLIF(h ->> 'createdAt', '')::bigint / 1000.0), now())
FROM public._grounded_pending p
CROSS JOIN LATERAL jsonb_array_elements(public._grounded_arr(p.data, 'habits')) AS h
JOIN public._grounded_id_map m
  ON m.user_id = p.user_id AND m.kind = 'habit' AND m.old_id = h ->> 'id';

-- Only truthy log entries become rows. Once a habit is toggled off the blob
-- keeps an explicit `false`, and those must NOT produce a completion row.
INSERT INTO public.habit_logs (user_id, habit_id, date)
SELECT DISTINCT
  p.user_id,
  m.new_id,
  logged.key::date
FROM public._grounded_pending p
CROSS JOIN LATERAL jsonb_array_elements(public._grounded_arr(p.data, 'habits')) AS h
JOIN public._grounded_id_map m
  ON m.user_id = p.user_id AND m.kind = 'habit' AND m.old_id = h ->> 'id'
CROSS JOIN LATERAL jsonb_each(
  CASE WHEN jsonb_typeof(h -> 'log') = 'object' THEN h -> 'log' ELSE '{}'::jsonb END
) AS logged
WHERE logged.value = 'true'::jsonb
  AND logged.key ~ '^\d{4}-\d{2}-\d{2}$'
ON CONFLICT (habit_id, date) DO NOTHING;

-- ---------------------------------------------------------------- 6. events

INSERT INTO public.events (user_id, title, date, area)
SELECT
  p.user_id,
  COALESCE(NULLIF(e ->> 'title', ''), 'Untitled event'),
  (e ->> 'date')::date,
  CASE WHEN e ->> 'area' IN ('personal', 'professional', 'education')
       THEN e ->> 'area' ELSE NULL END
FROM public._grounded_pending p
CROSS JOIN LATERAL jsonb_array_elements(public._grounded_arr(p.data, 'events')) AS e
WHERE NULLIF(e ->> 'date', '') IS NOT NULL;

-- -------------------------------------------------------- 7. focus_sessions

INSERT INTO public.focus_sessions (user_id, label, minutes, completed_at)
SELECT
  p.user_id,
  COALESCE(NULLIF(f ->> 'label', ''), 'Focus session'),
  GREATEST(COALESCE((f ->> 'minutes')::numeric, 25)::int, 1),
  COALESCE(to_timestamp(NULLIF(f ->> 'completedAt', '')::bigint / 1000.0), now())
FROM public._grounded_pending p
CROSS JOIN LATERAL jsonb_array_elements(public._grounded_arr(p.data, 'focusSessions')) AS f;

-- --------------------------------------------------------- 8. user_settings

INSERT INTO public.user_settings
  (user_id, display_name, density, accent, default_cal_view, widgets)
SELECT
  p.user_id,
  COALESCE(NULLIF(p.data -> 'settings' ->> 'displayName', ''), 'friend'),
  CASE WHEN p.data -> 'settings' ->> 'density' IN ('compact', 'comfy')
       THEN p.data -> 'settings' ->> 'density' ELSE 'comfy' END,
  CASE WHEN p.data -> 'settings' ->> 'accent' IN ('sage', 'clay', 'brown', 'tan')
       THEN p.data -> 'settings' ->> 'accent' ELSE 'sage' END,
  CASE WHEN p.data -> 'settings' ->> 'defaultCalView' IN ('week', 'month', 'year')
       THEN p.data -> 'settings' ->> 'defaultCalView' ELSE 'week' END,
  CASE WHEN jsonb_typeof(p.data -> 'settings' -> 'widgets') = 'array'
            AND jsonb_array_length(p.data -> 'settings' -> 'widgets') > 0
       THEN p.data -> 'settings' -> 'widgets'
       ELSE '[
         {"key": "greeting", "enabled": true},
         {"key": "tasks", "enabled": true},
         {"key": "goals", "enabled": true},
         {"key": "chart", "enabled": true},
         {"key": "calendar", "enabled": true},
         {"key": "upcoming", "enabled": true}
       ]'::jsonb END
FROM public._grounded_pending p
ON CONFLICT (user_id) DO NOTHING;

-- ------------------------------------------------------------ 9. stamp+clean

UPDATE public.grounded_state gs
SET migrated_at = now()
FROM public._grounded_pending p
WHERE p.user_id = gs.user_id;

DROP FUNCTION public._grounded_arr(jsonb, text);
DROP TABLE public._grounded_pending;
DROP TABLE public._grounded_id_map;
