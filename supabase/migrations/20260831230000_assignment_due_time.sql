-- A due time for assignments.
--
-- Coursework deadlines are almost never "that day" — they are 11:59pm on that
-- day, and the difference decides whether something is late. The date column
-- alone could not carry it, so a syllabus saying "due Aug 31, 11:59pm" lost
-- half of what it said on the way in.
--
-- Deliberately not a timestamptz, and deliberately separate from `date`.
--
-- A deadline of 11:59pm is 11:59pm where the student is. It is not an instant
-- on a global timeline: a course does not become due an hour earlier because
-- someone opened the app in another timezone over the break, and storing it as
-- an absolute instant would mean exactly that. Date and clock time, both naive,
-- is the honest shape for a due date, and it is what every syllabus means.
--
-- text rather than the `time` type because PostgREST returns `time` as
-- "23:59:00" while every input and every formatter here speaks "23:59". A
-- column that round-trips exactly is worth more than the type's own validation,
-- which the CHECK below supplies anyway.
alter table public.tasks
  add column if not exists due_time text;

-- 24-hour HH:MM, zero-padded. Rejects "11:59pm", "9:5" and "25:00" at the
-- database rather than letting a bad string reach a formatter that will render
-- it as "Invalid Date" somewhere far from where it was written.
alter table public.tasks
  drop constraint if exists tasks_due_time_format;

alter table public.tasks
  add constraint tasks_due_time_format
  check (due_time is null or due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- A time with no day is not a deadline. Nothing in the app can produce one, but
-- the assistant writes these rows too, and this is cheaper than finding out.
alter table public.tasks
  drop constraint if exists tasks_due_time_needs_date;

alter table public.tasks
  add constraint tasks_due_time_needs_date
  check (due_time is null or date is not null);

comment on column public.tasks.due_time is
  'Optional 24-hour HH:MM the task is due on its date. Local wall-clock time, not an instant.';
