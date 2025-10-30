import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateTrainingEventRequest,
  UpdateTrainingEventRequest,
  DeleteTrainingEventRequest,
  WorkoutEvent
} from './types';
import { tokensExist, createEventOnTrainingCalendar, updateEventOnTrainingCalendar, deleteEventFromTrainingCalendar, listTrainingCalendarEvents, DEFAULT_TIMEZONE, fetchPrimaryBusy, fetchPrimaryEvents, fetchTrainingEvent } from './google';
import { validateWorkoutDescription } from './validation';

function isWeekend(date: Date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}

function withinAllowedHours(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startHour = start.getHours();
  const endHour = end.getHours();
  const weekend = isWeekend(start);
  const minHour = weekend ? 7 : 6;
  const maxHour = 21; // inclusive end boundary at 21:00 local
  return startHour >= minHour && endHour <= maxHour;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

export const createTrainingEvent = async (req: Request<{}, {}, CreateTrainingEventRequest>, res: Response) => {
  const { title_short, start_local, end_local, description } = req.body;
  if (!title_short || !start_local || !end_local) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  if (!tokensExist()) return res.status(401).json({ message: 'Not authenticated with Google. Visit /api/calendar/connect' });
  if (!withinAllowedHours(start_local, end_local)) {
    return res.status(400).json({ message: 'Outside allowed hours' });
  }
  const descCheck = validateWorkoutDescription(description || '');
  if (!descCheck.ok) {
    return res.status(400).json({ message: 'Description missing required fields', missing: descCheck.missing });
  }
  try {
    // Conflict policy vs primary, with Lunch exception
    const primaryEvents = await fetchPrimaryEvents(start_local, end_local);
    const blocking = primaryEvents.filter(ev => {
      const evStart = ev.start?.dateTime || ev.start?.date;
      const evEnd = ev.end?.dateTime || ev.end?.date;
      if (!evStart || !evEnd) return false;
      if (!overlaps(start_local, end_local, evStart, evEnd)) return false;
      const title = (ev.summary || '').toLowerCase();
      return !title.includes('lunch');
    });
    if (blocking.length > 0) {
      return res.status(409).json({ message: 'Conflicts with primary calendar (non-Lunch)', conflicts: blocking.map(b => ({ id: b.id, summary: b.summary, start: b.start, end: b.end })) });
    }
    const created = await createEventOnTrainingCalendar({
      summary: title_short,
    description,
      startIso: start_local,
      endIso: end_local
    });
    return res.status(201).json({ event: created });
  } catch (e: any) {
    return res.status(500).json({ message: 'Failed to create event', error: e.message });
  }
};

export const updateTrainingEvent = async (req: Request<{}, {}, UpdateTrainingEventRequest>, res: Response) => {
  const { event_id, ...fields } = req.body as any;
  if (!event_id) return res.status(400).json({ message: 'Missing event_id' });
  if (!tokensExist()) return res.status(401).json({ message: 'Not authenticated with Google. Visit /api/calendar/connect' });
  try {
    const startIso = fields.start_local;
    const endIso = fields.end_local;
    if (startIso && endIso) {
      if (!withinAllowedHours(startIso, endIso)) {
        return res.status(400).json({ message: 'Outside allowed hours' });
      }
      const primaryEvents = await fetchPrimaryEvents(startIso, endIso);
      const blocking = primaryEvents.filter(ev => {
        const evStart = ev.start?.dateTime || ev.start?.date;
        const evEnd = ev.end?.dateTime || ev.end?.date;
        if (!evStart || !evEnd) return false;
        if (!overlaps(startIso, endIso, evStart, evEnd)) return false;
        const title = (ev.summary || '').toLowerCase();
        return !title.includes('lunch');
      });
      if (blocking.length > 0) {
        return res.status(409).json({ message: 'Conflicts with primary calendar (non-Lunch)', conflicts: blocking.map(b => ({ id: b.id, summary: b.summary, start: b.start, end: b.end })) });
      }
    }
    if (typeof fields.description === 'string') {
      const descCheck = validateWorkoutDescription(fields.description);
      if (!descCheck.ok) {
        return res.status(400).json({ message: 'Description missing required fields', missing: descCheck.missing });
      }
    }
    const updated = await updateEventOnTrainingCalendar(event_id, {
      summary: fields.title_short,
      description: fields.description,
      startIso: fields.start_local,
      endIso: fields.end_local
    });
    return res.status(200).json({ event: updated });
  } catch (e: any) {
    return res.status(500).json({ message: 'Failed to update event', error: e.message });
  }
};

export const deleteTrainingEvent = async (req: Request<{}, {}, DeleteTrainingEventRequest>, res: Response) => {
  const { event_id } = req.body;
  if (!event_id) return res.status(400).json({ message: 'Missing event_id' });
  if (!tokensExist()) return res.status(401).json({ message: 'Not authenticated with Google. Visit /api/calendar/connect' });
  try {
    const ev = await fetchTrainingEvent(event_id);
    const title = (ev.summary || '').toLowerCase();
    if (title.includes('race')) {
      return res.status(400).json({ message: 'Deletion blocked: event contains "Race"' });
    }
    await deleteEventFromTrainingCalendar(event_id);
    return res.status(200).json({ removed: { event_id } });
  } catch (e: any) {
    return res.status(500).json({ message: 'Failed to delete event', error: e.message });
  }
};

export const listPrimaryBusy = async (req: Request, res: Response) => {
  if (!tokensExist()) return res.status(401).json({ message: 'Not authenticated with Google. Visit /api/calendar/connect' });
  const { time_min_iso, time_max_iso } = req.query as any;
  if (!time_min_iso || !time_max_iso) {
    return res.status(400).json({ message: 'Missing time_min_iso or time_max_iso' });
  }
  try {
    const busy = await fetchPrimaryBusy(time_min_iso, time_max_iso);
    return res.status(200).json({ busy });
  } catch (e: any) {
    return res.status(500).json({ message: 'Failed to fetch primary busy', error: e.message });
  }
};

export const listTrainingEvents = async (req: Request, res: Response) => {
  if (!tokensExist()) return res.status(401).json({ message: 'Not authenticated with Google. Visit /api/calendar/connect' });
  try {
    const events = await listTrainingCalendarEvents();
    return res.status(200).json({ events });
  } catch (e: any) {
    return res.status(500).json({ message: 'Failed to list events', error: e.message });
  }
};
