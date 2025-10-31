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

- `POST /api/llm/plan` — input: `{ "prompt": "Plan next week; prefer long ride Saturday, long run Friday." }` → output: create proposals + combined diff. Uses a rule-based fallback planner (no external API). Future: OpenAI via `OPENAI_API_KEY`.

### LLM configuration

- Optional environment variables (in `api/.env`):
  - `OPENAI_API_KEY=...`
  - `OPENAI_MODEL=gpt-4o-mini` (default)

If `OPENAI_API_KEY` is present, the planner uses OpenAI; otherwise it falls back to the internal rule-based planner. The API still enforces validations/conflict policies on all generated items.

## Policies enforced (server-side)

- Writes only to `TRAINING_CALENDAR_ID`.
- Conflict policy vs. primary calendar: overlaps are blocked unless the primary event title contains "Lunch" (case-insensitive).
- Allowed hours: weekdays 06:00–21:00, weekends 07:00–21:00 (local).
- Never delete events that contain "Race" in the title.
- Description content validation: planned (see roadmap).

## Feature Progress

- [x] Google OAuth (tokens persisted locally) and calendar list test
- [x] Training calendar ID wiring (writes restricted to this calendar)
- [x] CRUD endpoints for training events (Google Calendar)
- [x] Primary calendar FreeBusy/events for conflict checks
- [x] Conflict policy (Lunch exception) and allowed-hours guardrails
- [x] Deletion guard for "Race"
- [x] Approval/diff workflow (propose/list/approve/reject)
- [x] Description validator (duration, targets, intervals, notes, TSS, kcal)
- [x] Weekly "Plan" endpoint to generate multi-event proposals + combined diff (LLM-powered)
- [x] Natural-language modify-day/week endpoint (LLM-powered with approval workflow)
- [ ] Weather commute stub (API, daily check, make-up mileage proposal)
- [ ] Holiday and Toronto pool hours stubs
- [ ] Notifications stub (push)
- [ ] Exporters (.ZWO etc.)

## Next up

1) Description validator on create/update (reject or auto-augment description).
2) Weekly Plan generator (mock rules) that emits a set of create proposals with a readable diff.
3) Simple frontend surface to view proposals, diffs, and approve.

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
