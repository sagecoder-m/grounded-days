-- The board everyone starts on.
--
-- Not a guess: this arrangement was built by hand on the board and then read
-- back out of it, which is why the widths are 15/11/10 rather than tidy
-- thirds. The greeting across the top, the attention chart and Upcoming down
-- the left, the timer above the river in the middle, and the day's list
-- running full height on the right.
--
-- Applied to every account, not only new ones. That is deliberate and it was
-- asked for: the previous shape names could not express a position, so the
-- positions currently stored were either defaults nobody chose or the wreckage
-- of the collision bug that moved widgets around on its own. There is no
-- arrangement here worth preserving, and this is the moment to set one before
-- anybody builds on top of it.
--
-- After this, positions are the person's own: dragging or resizing writes
-- straight to this column and nothing else overwrites it. Anyone who wants
-- this arrangement back has "Reset layout" on the board.

ALTER TABLE public.user_settings ALTER COLUMN widgets SET DEFAULT '[
  {"key": "greeting", "enabled": true,  "x": 0,  "y": 0,  "w": 36, "h": 5},
  {"key": "balance",  "enabled": true,  "x": 0,  "y": 5,  "w": 15, "h": 9},
  {"key": "focus",    "enabled": true,  "x": 15, "y": 5,  "w": 11, "h": 7},
  {"key": "day",      "enabled": true,  "x": 26, "y": 5,  "w": 10, "h": 19},
  {"key": "river",    "enabled": true,  "x": 15, "y": 12, "w": 11, "h": 11},
  {"key": "upcoming", "enabled": true,  "x": 0,  "y": 14, "w": 14, "h": 19},
  {"key": "chart",    "enabled": false, "x": 0,  "y": 33, "w": 36, "h": 11},
  {"key": "goals",    "enabled": false, "x": 0,  "y": 44, "w": 18, "h": 9},
  {"key": "rhythm",   "enabled": false, "x": 18, "y": 44, "w": 18, "h": 9},
  {"key": "movement", "enabled": false, "x": 0,  "y": 53, "w": 18, "h": 9}
]'::jsonb;

UPDATE public.user_settings
SET widgets = '[
  {"key": "greeting", "enabled": true,  "x": 0,  "y": 0,  "w": 36, "h": 5},
  {"key": "balance",  "enabled": true,  "x": 0,  "y": 5,  "w": 15, "h": 9},
  {"key": "focus",    "enabled": true,  "x": 15, "y": 5,  "w": 11, "h": 7},
  {"key": "day",      "enabled": true,  "x": 26, "y": 5,  "w": 10, "h": 19},
  {"key": "river",    "enabled": true,  "x": 15, "y": 12, "w": 11, "h": 11},
  {"key": "upcoming", "enabled": true,  "x": 0,  "y": 14, "w": 14, "h": 19},
  {"key": "chart",    "enabled": false, "x": 0,  "y": 33, "w": 36, "h": 11},
  {"key": "goals",    "enabled": false, "x": 0,  "y": 44, "w": 18, "h": 9},
  {"key": "rhythm",   "enabled": false, "x": 18, "y": 44, "w": 18, "h": 9},
  {"key": "movement", "enabled": false, "x": 0,  "y": 53, "w": 18, "h": 9}
]'::jsonb;
