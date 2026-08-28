-- Let a daily habit belong to a goal.
--
-- Personal's whole argument, in the brief's words, is that "goals align with
-- daily habits" — the goal is the thing you want, and the habit is the small
-- repeated act that gets you there. The app has always held both and never
-- connected them, so the alignment was a claim the data could not back: ticking
-- "walk outside" for three weeks moved no goal anywhere.
--
-- One nullable column rather than a join table, because the relationship is
-- genuinely one-way and one-deep. A habit serves at most one goal; a goal can
-- have several. "Drink water" belonging to two different ambitions at once is
-- not a thing anyone needs to express, and a join table would make the simple
-- case cost a second query.
--
-- ON DELETE SET NULL, never cascade. Deleting a goal must not delete the habit
-- that fed it: the goal is the ambition and the habit is the practice, and
-- giving up on the first is not a reason to lose the second. The habit simply
-- goes back to standing on its own.

ALTER TABLE public.habits
  ADD COLUMN goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL;

-- Partial: most habits will serve no goal, and an index over a mostly-NULL
-- column is mostly dead weight. This covers the lookup the goal card makes.
CREATE INDEX habits_goal_id_idx ON public.habits (goal_id)
  WHERE goal_id IS NOT NULL;

COMMENT ON COLUMN public.habits.goal_id IS
  'Optional goal this habit works towards. NULL is normal. Deleting the goal clears this rather than removing the habit.';
