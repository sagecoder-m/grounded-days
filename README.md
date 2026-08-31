# Grounded Days

Build "Grounded" — a calm, ADHD-friendly personal care platform for building habits and systems across three life areas: Personal, Professional, and Education. The owner has ADHD symptoms and struggles with consistency and focus, so the design must reduce overwhelm: one clear thing at a time, generous whitespace, gentle language (never shaming — e.g. overdue items say "gently overdue"), satisfying check-off interactions, and no clutter.

DESIGN SYSTEM (follow exactly — this is from an existing prototype):

- Colors: background #EFE9DD (warm beige), card surface #F8F4EB (cream), secondary surface #EDE4D3, tan #D9CBB2, sage green #8CA382 (primary accent), deep sage #6E8664, soft sage #DDE5D6, clay #C29A76 (education accent), soft clay #EBDCCB, brown #A98E6F (professional accent), soft brown #E7DCCB, ink text #4B4237, soft text #857763, borders #E2D8C6.
- Typography: Fraunces (serif) for headings, Karla (sans) for body.
- Style: rounded corners (~18px radius), very soft shadows, pill-shaped chips, calm and inviting — designed to soothe the nervous system. Area color coding everywhere: sage = Personal, brown = Professional, clay = Education.
- Progress bars use a sage gradient. Checkboxes are rounded squares that fill sage with a white check.

PAGES (sidebar or top tab navigation): Overview, Personal, Professional, Education, Profile.

1. OVERVIEW

- Current date displayed prominently with a time-of-day greeting.
- A combined task list showing everything to do across Personal, Professional, Education, each with its colored area chip.
- Goal progress summary: overall percentage per area PLUS a modern, minimal graph (e.g. soft area/donut charts in the palette) comparing progress across the three areas.
- Calendar with weekly, monthly, and annual views (design placeholder hooks for future Google, Outlook, and Canvas calendar sync — but local events only for now).
- "Upcoming" section listing upcoming tasks and events: items can ONLY be checked off here, nothing is editable or deletable in this section.

2. PERSONAL

- Habit/action tracking: recurring daily actions like walking, journaling, making my bed — with a daily checklist and visual tracking over time (streak-free, gentle: show weekly completion dots instead of hard streaks).
- Add goals with a name + description; each goal has a progress bar.
- Add tasks with dates + descriptions.
- A graph showing habit consistency and goal progress over time.

3. PROFESSIONAL

- Project-management style: a list of projects; each project can contain sub-projects; each sub-project contains tasks and goals with tracking. Example seeded data: project "Progression State" → sub-project "NCE" → tasks and goals under it. Also seed a project "CultivateIQ" with a status of "On pause" (paused state shown with a dashed tag, progress bar in tan instead of sage).
- Expandable/collapsible project → sub-project → task hierarchy, with per-project progress rollup.

4. EDUCATION

- Planner style: clear view of what I need to do (assignments/tasks with dates and descriptions) plus a History section of everything completed.
- Add goals with descriptions and tasks with dates + descriptions.
- A FOCUS TIMER for getting work done (I struggle with focus): a calm Pomodoro-style timer (25/5 default, adjustable), with a soft visual countdown in the palette, session labels, and a gentle completion sound/message. Log completed focus sessions to the history.
- Context: starting an M.S. in Business Analytics at Georgetown on August 3, 2026 — show a subtle countdown to that date.

5. PROFILE

- Dashboard customization: options to change how the dashboard looks — e.g. toggle which Overview widgets appear and their order, choose default calendar view, light density vs. comfy density, and pick between a few accent variations within the earth-tone palette.
- Editable display name used in the greeting.

Persist everything (tasks, goals, habits, projects, settings) so nothing is lost between sessions. Seed the app with realistic example data matching the examples above (personal goals: improve self-confidence, walk consistently, better mental health). Make it responsive and mobile-friendly.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/609db024-df71-447d-89de-544f7a83b8cd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
