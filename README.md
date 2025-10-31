# Training & Calendar Coach

Status-oriented notes for local development, features, and roadmap.

## Monorepo Overview

- Frontend (Next.js): `src/`
- Backend API (Express/TypeScript): `api/` (runs on port 4100)

## Backend: Run locally

1) Install and configure

```bash
cd api
npm install
```

Create `api/.env` with:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:4100/api/calendar/oauth2callback
TRAINING_CALENDAR_ID=your-training-calendar-id@group.calendar.google.com
DEFAULT_TIMEZONE=America/Toronto
WEATHER_LOCATION=Toronto,CA (optional, defaults to Toronto - uses Open-Meteo, no API key needed!)
OPENAI_API_KEY=... (optional, for LLM planner)
OPENAI_MODEL=gpt-4o-mini (optional, default model)
# Model recommendations:
# - gpt-4o-mini (default): Fast, cheap, good for structured JSON generation
# - gpt-4o: Better reasoning and JSON adherence, slightly slower/more expensive
# - gpt-4-turbo: Good balance of speed and quality
# Note: Use gpt-4o or newer models for better instruction following and JSON structure compliance
```

2) Start API

```bash
npm run dev
```

3) Authenticate Google once

- Open `http://localhost:4100/api/calendar/connect`
- Verify: `http://localhost:4100/api/calendar/auth_status` → `{ authenticated: true }`

Tokens are persisted to `api/tokens.json` (dev only).

## Key API endpoints (MVP)

- Health: `GET /api/health`
- OAuth: `GET /api/calendar/connect`, `GET /api/calendar/oauth2callback`, `GET /api/calendar/auth_status`
- Training Calendar (Google):
  - `POST /api/calendar/create_training_event`
  - `POST /api/calendar/update_training_event`
  - `POST /api/calendar/delete_training_event`
  - `GET  /api/calendar/list_training_events`
- Primary calendar busy (Google FreeBusy):
  - `GET  /api/calendar/list_primary_busy?time_min_iso=...&time_max_iso=...`
- Approvals & Diff (propose → approve):
  - `GET  /api/approvals/list`
  - `POST /api/approvals/propose_create`
  - `POST /api/approvals/propose_update`
  - `POST /api/approvals/propose_delete`
  - `POST /api/approvals/approve`
  - `POST /api/approvals/reject`

## LLM endpoints

- `POST /api/llm/plan` — Generate a new weekly training plan. Input: `{ "prompt": "Plan 9 workouts for next week: 3 swims, 3 runs, and 3 rides." }` → Output: create proposals + combined diff. Uses OpenAI (if `OPENAI_API_KEY` is set) or falls back to rule-based planner.
- `POST /api/llm/modify` — Modify existing workouts using natural language. Input: `{ "prompt": "Move Monday's swim to Tuesday morning", "existingEvents": [...] }` → Output: modification proposals (update/delete/create) + combined diff.

## Weather endpoints

- `POST /api/weather/check` — Check weather for multiple workouts. Input: `{ "workouts": [{ "title": "...", "description": "...", "start_local": "..." }] }`. Returns weather forecasts for each workout. Uses Open-Meteo (free, no API key required).
- `POST /api/weather/check-single` — Check weather for a single workout.
- `POST /api/weather/reschedule-bad-weather` — Auto-generate reschedule proposals for workouts with bad weather conditions (outdoor runs/rides only).

### LLM configuration

- Optional environment variables (in `api/.env`):
  - `OPENAI_API_KEY=...`
  - `OPENAI_MODEL=gpt-4o-mini` (default)

If `OPENAI_API_KEY` is present, the planner uses OpenAI; otherwise it falls back to the internal rule-based planner. The API still enforces validations/conflict policies on all generated items.

**Model Recommendations:**
- `gpt-4o-mini` (default): Fast, cheap, good for structured JSON generation
- `gpt-4o`: Better reasoning and JSON adherence, slightly slower/more expensive
- `gpt-4-turbo`: Good balance of speed and quality

## Frontend: Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000/plan-week](http://localhost:3000/plan-week) to access the planning interface.

## Policies enforced (server-side)

- Writes only to `TRAINING_CALENDAR_ID`.
- Conflict policy vs. primary calendar: overlaps are blocked unless the primary event title contains "Lunch" (case-insensitive). All-day events show as warnings (not blockers).
- Allowed hours:
  - Weekdays: Morning 6:30 AM - 9:30 AM OR Evening 6:00 PM onwards (no afternoon workouts)
  - Weekends: Any time (bias for mornings, especially for long workouts)
- Never delete events that contain "Race" in the title.
- Description validation: Must include Duration, Distance, Time, Targets, Intervals, Notes, TSS, and kcal fields.
- Auto-rescheduling: Workouts that conflict or violate time slots are automatically rescheduled to valid slots.
- Event spacing: Minimum 30-minute gap between events (except brick workouts: bike → run allowed back-to-back).

## Feature Progress

### ✅ Completed (MVP+)

**Backend:**
- [x] Google OAuth (tokens persisted locally)
- [x] Training calendar ID wiring (writes restricted to this calendar)
- [x] CRUD endpoints for training events (Google Calendar)
- [x] Primary calendar FreeBusy/events for conflict checks
- [x] Conflict policy (Lunch exception) and allowed-hours guardrails
- [x] All-day events treated as warnings (not blockers)
- [x] Deletion guard for "Race" events
- [x] Approval/diff workflow (propose/list/approve/reject with GitHub-style diffs)
- [x] Description validator (duration, targets, intervals, notes, TSS, kcal)
- [x] Weekly "Plan" endpoint to generate multi-event proposals + combined diff (LLM-powered)
- [x] Natural-language modify-day/week endpoint (LLM-powered with approval workflow)
- [x] Auto-scheduling/rescheduling for conflicts and invalid time slots
- [x] Event spacing validation (30-minute gaps, brick workout exceptions)
- [x] Weather integration (Open-Meteo API, no key required, visual forecasts, bad weather detection for outdoor workouts)
- [x] Timezone handling (consistent ISO string parsing to avoid conversion issues)

**Frontend:**
- [x] Planning interface with unified input (generate new plan / modify existing)
- [x] Proposals approval UI with GitHub-style diffs
- [x] Calendar week view (Google Calendar-style visual)
- [x] Events list table with weather badges
- [x] Event details modal
- [x] Toast notifications
- [x] Loading skeletons
- [x] Tab navigation (Plan & Modify / Calendar View)
- [x] Weather badges for all workouts
- [x] Reset/delete next week button

### 🚧 Incomplete / Planned

- [ ] Holiday and Toronto pool hours integration
- [ ] Notifications (push notifications for upcoming workouts)
- [ ] Exporters (.ZWO files for Zwift, TrainingPeaks, etc.)
- [ ] Multi-calendar support (currently Google Calendar only)
- [ ] Template/plan library
- [ ] Historical workout tracking and analytics

## Next Steps (Recommended)

**High Priority:**
1. **Workout Export** — Add .ZWO file export for Zwift compatibility
2. **Pool Hours Integration** — Check Toronto pool hours and suggest swim times accordingly
3. **Template System** — Save and reuse training plan templates

**Medium Priority:**
4. **Notifications** — Push notifications for upcoming workouts (browser push or email)
5. **Historical Analytics** — Track completed workouts and adjust future plans
6. **Multi-Calendar Support** — Add Apple Calendar, Outlook, etc. via abstraction layer

**Low Priority:**
7. **Holiday Calendar** — Integration with holiday calendars for better scheduling
8. **Multi-User Support** — Shared calendars for teams/clubs

## UI Features

The frontend includes:
- **Planning Interface**: Unified text input for generating new plans or modifying existing ones
- **Tabbed Navigation**: Switch between "Plan & Modify" and "Calendar View"
- **Proposals System**: Review and approve/reject workout proposals with visual diffs
- **Calendar Week View**: Google Calendar-style visual representation of the week
- **Events Table**: List all events with weather badges and reset functionality
- **Event Details Modal**: View full workout details
- **Weather Integration**: Visual weather badges for all workouts
- **Responsive Design**: Modern, sleek UI with Figtree font and Tailwind CSS

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
