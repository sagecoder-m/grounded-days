CREATE TABLE public.grounded_state (
  user_id uuid NOT NULL PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grounded_state TO authenticated;
GRANT ALL ON public.grounded_state TO service_role;

ALTER TABLE public.grounded_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own state"
  ON public.grounded_state FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own state"
  ON public.grounded_state FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own state"
  ON public.grounded_state FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own state"
  ON public.grounded_state FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_grounded_state_updated_at
BEFORE UPDATE ON public.grounded_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();