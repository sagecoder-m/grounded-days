-- Changing a calendar's area should move the events already in it.
--
-- Setting a connection to Education wrote the choice onto the connection and
-- stopped there, so the events synced before the change kept the area they
-- were given at sync time. A Georgetown calendar set to Education went on
-- showing ninety-two events labelled Personal, and nothing the person could do
-- in the app would fix it: the label was right in settings and wrong
-- everywhere it mattered.
--
-- The client cannot do this itself, and should not be able to. RLS restricts
-- writes on events to `source = 'local'`, which is what stops a browser
-- rewriting mirrored provider data — a guarantee worth keeping. So this is a
-- SECURITY DEFINER function instead: one narrow operation, and it checks
-- ownership itself rather than inheriting it.
--
-- Both statements are filtered on auth.uid(). The first is what makes the call
-- safe; the second is belt and braces, since an event's connection already
-- implies its owner.

CREATE OR REPLACE FUNCTION public.set_connection_area(
  p_connection_id uuid,
  p_area text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A definer function runs as its owner, so it validates what it is given
  -- rather than trusting the caller. NULL is allowed and means "no area".
  IF p_area IS NOT NULL AND p_area NOT IN ('personal', 'professional', 'education') THEN
    RAISE EXCEPTION 'invalid area: %', p_area;
  END IF;

  UPDATE public.calendar_connections
  SET default_area = p_area
  WHERE id = p_connection_id
    AND user_id = auth.uid();

  -- Nothing updated means the connection is not this caller's, or does not
  -- exist. Either way the events below must not be touched.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'connection not found';
  END IF;

  UPDATE public.events
  SET area = p_area
  WHERE connection_id = p_connection_id
    AND user_id = auth.uid();
END;
$$;

-- PUBLIC includes the anon role. A signed-out caller has no auth.uid(), so the
-- ownership check would fail anyway — but the grant should say so rather than
-- relying on that.
REVOKE EXECUTE ON FUNCTION public.set_connection_area(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_connection_area(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.set_connection_area(uuid, text) IS
  'Sets a calendar connection''s area and relabels the events already synced from it. '
  'SECURITY DEFINER because RLS restricts client writes on events to source = ''local''.';
