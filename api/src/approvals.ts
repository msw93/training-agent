import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { tokensExist, createEventOnTrainingCalendar, updateEventOnTrainingCalendar, deleteEventFromTrainingCalendar, fetchPrimaryEvents, fetchTrainingEvent } from './google';
import { validateWorkoutDescription } from './validation';

type ProposalType = 'create' | 'update' | 'delete';

interface BaseProposal {
  id: string;
  type: ProposalType;
  createdAt: string;
}

interface CreateProposal extends BaseProposal {
  type: 'create';
  payload: {
    title_short: string;
    start_local: string;
    end_local: string;
    description: string;
  };
  allDayWarnings?: Array<{ id: string; summary: string; start: any; end: any; type: 'all-day' }>;
}

interface UpdateProposal extends BaseProposal {
  type: 'update';
  payload: {
    event_id: string;
    title_short?: string;
    start_local?: string;
    end_local?: string;
    description?: string;
  };
}

interface DeleteProposal extends BaseProposal {
  type: 'delete';
  payload: {
    event_id: string;
  };
}

type Proposal = CreateProposal | UpdateProposal | DeleteProposal;

export const proposals: Proposal[] = [];

function parseTimeFromISO(iso: string): { hour: number; minute: number; day: number } {
  // Extract time from ISO string directly to avoid timezone conversion
  const timeMatch = iso.match(/T(\d{2}):(\d{2})/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    const dateMatch = iso.match(/(\d{4}-\d{2}-\d{2})/);
    const dateStr = dateMatch ? dateMatch[1] : '';
    const date = new Date(dateStr + 'T00:00:00');
    return { hour, minute, day: date.getDay() };
  }
  const d = new Date(iso);
  return { hour: d.getHours(), minute: d.getMinutes(), day: d.getDay() };
}

function isWeekend(date: Date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}

function withinAllowedHours(startIso: string, endIso: string) {
  const start = parseTimeFromISO(startIso);
  const end = parseTimeFromISO(endIso);
  const weekend = start.day === 0 || start.day === 6;
  
  // Morning slot: 6:30 AM - 9:30 AM
  const morningStart = start.hour > 6 || (start.hour === 6 && start.minute >= 30);
  const morningEnd = end.hour < 9 || (end.hour === 9 && end.minute <= 30);
  const isMorning = morningStart && morningEnd;
  
  if (!weekend) {
    // Weekdays: Morning (6:30-9:30 AM) OR evening (6:00 PM onwards)
    // Block afternoon: 9:30 AM - 6:00 PM
    if (isMorning) return true;
    
    // Evening: 6:00 PM (18:00) or later
    const eveningStart = start.hour >= 18;
    return eveningStart;
  }
  
  // Weekends: ANY time is allowed (validation passes for all weekend times)
  return true;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

// Check if an event is all-day (has date but no dateTime)
function isAllDayEvent(ev: any): boolean {
  // All-day events have start.date and end.date, but no start.dateTime
  return !!(ev.start?.date && !ev.start?.dateTime);
}

async function checkConflicts(startIso: string, endIso: string) {
  console.log(`[checkConflicts] Checking conflicts for ${startIso} → ${endIso}`);
  const primaryEvents = await fetchPrimaryEvents(startIso, endIso);
  console.log(`[checkConflicts] Found ${primaryEvents.length} events in primary calendar for this time range`);
  
  const blocking: any[] = [];
  const allDayWarnings: any[] = [];
  
  primaryEvents.forEach((ev: any) => {
    const evStart = ev.start?.dateTime || ev.start?.date;
    const evEnd = ev.end?.dateTime || ev.end?.date;
    if (!evStart || !evEnd) return;
    
    // Check if it's an all-day event
    if (isAllDayEvent(ev)) {
      // All-day events: check if the workout date falls within the all-day event range
      const workoutDate = startIso.split('T')[0]; // Get YYYY-MM-DD part
      const allDayStart = ev.start.date;
      const allDayEnd = ev.end.date; // Google Calendar all-day events: end date is exclusive
      
      // Check if workout date is within all-day event range
      if (workoutDate >= allDayStart && workoutDate < allDayEnd) {
        const title = (ev.summary || '').toLowerCase();
        const isLunch = title.includes('lunch');
        if (!isLunch) {
          console.log(`[checkConflicts] ⚠️ All-day event warning: "${ev.summary}" (${allDayStart} → ${allDayEnd}) overlaps with workout`);
          allDayWarnings.push({
            id: ev.id,
            summary: ev.summary,
            start: ev.start,
            end: ev.end,
            type: 'all-day' as const
          });
        }
      }
      return; // All-day events don't block, just warn
    }
    
    // Regular timed events: check overlap
    if (!overlaps(startIso, endIso, evStart, evEnd)) return;
    
    const title = (ev.summary || '').toLowerCase();
    const isLunch = title.includes('lunch');
    if (isLunch) {
      console.log(`[checkConflicts] Skipping lunch event: "${ev.summary}" (${evStart} → ${evEnd})`);
      return;
    }
    
    // This is a blocking timed event
    blocking.push(ev);
  });
  
  if (blocking.length > 0) {
    console.log(`[checkConflicts] ⚠️ Found ${blocking.length} blocking events:`);
    blocking.forEach((b: any, idx: number) => {
      const bStart = b.start?.dateTime || b.start?.date;
      const bEnd = b.end?.dateTime || b.end?.date;
      console.log(`[checkConflicts]   ${idx + 1}. "${b.summary}" (${bStart} → ${bEnd})`);
    });
  }
  
  if (allDayWarnings.length > 0) {
    console.log(`[checkConflicts] 📋 Found ${allDayWarnings.length} all-day events (warnings only, not blocking):`);
    allDayWarnings.forEach((w: any, idx: number) => {
      console.log(`[checkConflicts]   ${idx + 1}. "${w.summary}" (${w.start.date} → ${w.end.date})`);
    });
  }
  
  if (blocking.length === 0 && allDayWarnings.length === 0) {
    console.log(`[checkConflicts] ✓ No conflicts found`);
  }
  
  return {
    blocking: blocking.map((b: any) => ({ id: b.id, summary: b.summary, start: b.start, end: b.end })),
    allDayWarnings: allDayWarnings.map((w: any) => ({ id: w.id, summary: w.summary, start: w.start, end: w.end, type: 'all-day' as const }))
  };
}

function eventSummaryForDiff(title?: string, start?: string, end?: string) {
  // Parse ISO string directly to avoid timezone conversion issues in display
  const formatTime = (iso?: string): string => {
    if (!iso) return '—';
    const match = iso.match(/T(\d{2}):(\d{2})/);
    if (!match) return iso;
    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    const dateMatch = iso.match(/(\d{4}-\d{2}-\d{2})/);
    const dateStr = dateMatch ? dateMatch[1] : '';
    // Format as readable date/time
    const date = new Date(iso);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${month}/${day}/${date.getFullYear() % 100}, ${displayHour}:${String(minute).padStart(2, '0')} ${ampm}`;
  };
  const s = formatTime(start);
  const e = formatTime(end);
  return `${title || 'Untitled'} | ${s} → ${e}`;
}

export const listProposals = (_req: Request, res: Response) => {
  return res.status(200).json({ proposals });
};

export async function proposeCreateInternal(payload: { title_short: string; start_local: string; end_local: string; description: string; }) {
  const { title_short, start_local, end_local, description } = payload;
  if (!tokensExist()) throw new Error('Not authenticated with Google. Visit /api/calendar/connect');
  if (!title_short || !start_local || !end_local) throw new Error('Missing required fields');
  if (!withinAllowedHours(start_local, end_local)) throw new Error('Outside allowed hours');
  const descCheck = validateWorkoutDescription(description || '');
  if (!descCheck.ok) throw new Error('Description missing required fields: ' + descCheck.missing.join(','));
  const conflictResult = await checkConflicts(start_local, end_local);
  if (conflictResult.blocking.length > 0) {
    const err: any = new Error('Conflicts with primary (non-Lunch)');
    err.status = 409;
    err.conflicts = conflictResult.blocking;
    throw err;
  }
  // Note: allDayWarnings are returned but don't block - they'll be included in the proposal
  const id = uuidv4();
  const proposal: CreateProposal = {
    id,
    type: 'create',
    createdAt: new Date().toISOString(),
    payload: { title_short, start_local, end_local, description },
    allDayWarnings: conflictResult.allDayWarnings.length > 0 ? conflictResult.allDayWarnings : undefined
  };
  proposals.push(proposal);
  const diff = `Create → ${eventSummaryForDiff(title_short, start_local, end_local)}`;
  return { proposal, diff };
}

export async function proposeUpdateInternal(payload: { event_id: string; title_short?: string; start_local?: string; end_local?: string; description?: string; }) {
  const { event_id, title_short, start_local, end_local, description } = payload;
  if (!tokensExist()) throw new Error('Not authenticated with Google. Visit /api/calendar/connect');
  if (!event_id) throw new Error('Missing event_id');
  const current = await fetchTrainingEvent(event_id);
  if (!current) throw new Error('Event not found');

  if (start_local && end_local) {
    if (!withinAllowedHours(start_local, end_local)) throw new Error('Outside allowed hours');
    const conflictResult = await checkConflicts(start_local, end_local);
    if (conflictResult.blocking.length > 0) {
      const err: any = new Error('Conflicts with primary (non-Lunch)');
      err.status = 409;
      err.conflicts = conflictResult.blocking;
      throw err;
    }
  }
  if (typeof description === 'string') {
    const descCheck = validateWorkoutDescription(description);
    if (!descCheck.ok) throw new Error('Description missing required fields: ' + descCheck.missing.join(','));
  }

  const id = uuidv4();
  const proposal: UpdateProposal = {
    id,
    type: 'update',
    createdAt: new Date().toISOString(),
    payload: { event_id, title_short, start_local, end_local, description }
  };
  proposals.push(proposal);
  const currStart = (current.start?.dateTime ?? current.start?.date) ?? undefined;
  const currEnd = (current.end?.dateTime ?? current.end?.date) ?? undefined;
  const before = eventSummaryForDiff(current.summary ?? undefined, currStart, currEnd);
  const after = eventSummaryForDiff(title_short ?? (current.summary ?? undefined), start_local ?? currStart, end_local ?? currEnd);
  const diff = `Update → ${before} ⟶ ${after}`;
  return { proposal, diff };
}

export async function proposeDeleteInternal(event_id: string) {
  if (!tokensExist()) throw new Error('Not authenticated with Google. Visit /api/calendar/connect');
  if (!event_id) throw new Error('Missing event_id');
  const current = await fetchTrainingEvent(event_id);
  if (!current) throw new Error('Event not found');
  const title = (current.summary || '').toLowerCase();
  if (title.includes('race')) throw new Error('Deletion blocked: event contains "Race"');

  const id = uuidv4();
  const proposal: DeleteProposal = {
    id,
    type: 'delete',
    createdAt: new Date().toISOString(),
    payload: { event_id }
  };
  proposals.push(proposal);
  const delStart = (current.start?.dateTime ?? current.start?.date) ?? undefined;
  const delEnd = (current.end?.dateTime ?? current.end?.date) ?? undefined;
  const before = eventSummaryForDiff(current.summary ?? undefined, delStart, delEnd);
  const diff = `Delete → ${before}`;
  return { proposal, diff };
}

export const proposeCreate = async (req: Request, res: Response) => {
  try {
    const { proposal, diff } = await proposeCreateInternal(req.body || {});
    return res.status(201).json({ proposal, diff });
  } catch (e: any) {
    const status = e.status || 400;
    const body: any = { message: e.message };
    if (e.conflicts) body.conflicts = e.conflicts;
    return res.status(status).json(body);
  }
};

export const proposeUpdate = async (req: Request, res: Response) => {
  const { event_id, title_short, start_local, end_local, description } = req.body || {};
  if (!tokensExist()) return res.status(401).json({ message: 'Not authenticated with Google. Visit /api/calendar/connect' });
  if (!event_id) return res.status(400).json({ message: 'Missing event_id' });
  const current = await fetchTrainingEvent(event_id);
  if (!current) return res.status(404).json({ message: 'Event not found' });

  if (start_local && end_local) {
    if (!withinAllowedHours(start_local, end_local)) return res.status(400).json({ message: 'Outside allowed hours' });
    const conflictResult = await checkConflicts(start_local, end_local);
    if (conflictResult.blocking.length > 0) return res.status(409).json({ message: 'Conflicts with primary (non-Lunch)', conflicts: conflictResult.blocking });
  }
  if (typeof description === 'string') {
    const descCheck = validateWorkoutDescription(description);
    if (!descCheck.ok) return res.status(400).json({ message: 'Description missing required fields', missing: descCheck.missing });
  }

  const id = uuidv4();
  const proposal: UpdateProposal = {
    id,
    type: 'update',
    createdAt: new Date().toISOString(),
    payload: { event_id, title_short, start_local, end_local, description }
  };
  proposals.push(proposal);
  const currStart = (current.start?.dateTime ?? current.start?.date) ?? undefined;
  const currEnd = (current.end?.dateTime ?? current.end?.date) ?? undefined;
  const before = eventSummaryForDiff(current.summary ?? undefined, currStart, currEnd);
  const after = eventSummaryForDiff(title_short ?? (current.summary ?? undefined), start_local ?? currStart, end_local ?? currEnd);
  const diff = `Update → ${before} ⟶ ${after}`;
  return res.status(201).json({ proposal, diff });
};

export const proposeDelete = async (req: Request, res: Response) => {
  const { event_id } = req.body || {};
  if (!tokensExist()) return res.status(401).json({ message: 'Not authenticated with Google. Visit /api/calendar/connect' });
  if (!event_id) return res.status(400).json({ message: 'Missing event_id' });
  const current = await fetchTrainingEvent(event_id);
  if (!current) return res.status(404).json({ message: 'Event not found' });
  const title = (current.summary || '').toLowerCase();
  if (title.includes('race')) return res.status(400).json({ message: 'Deletion blocked: event contains "Race"' });

  const id = uuidv4();
  const proposal: DeleteProposal = {
    id,
    type: 'delete',
    createdAt: new Date().toISOString(),
    payload: { event_id }
  };
  proposals.push(proposal);
  const delStart = (current.start?.dateTime ?? current.start?.date) ?? undefined;
  const delEnd = (current.end?.dateTime ?? current.end?.date) ?? undefined;
  const before = eventSummaryForDiff(current.summary ?? undefined, delStart, delEnd);
  const diff = `Delete → ${before}`;
  return res.status(201).json({ proposal, diff });
};

export const approveProposal = async (req: Request, res: Response) => {
  const { proposal_id } = req.body || {};
  if (!proposal_id) return res.status(400).json({ message: 'Missing proposal_id' });
  const idx = proposals.findIndex(p => p.id === proposal_id);
  if (idx === -1) return res.status(404).json({ message: 'Proposal not found' });
  const p = proposals[idx];
  try {
    if (p.type === 'create') {
      const payload = (p as CreateProposal).payload;
      const created = await createEventOnTrainingCalendar({
        summary: payload.title_short,
        description: payload.description,
        startIso: payload.start_local,
        endIso: payload.end_local
      });
      proposals.splice(idx, 1);
      return res.status(200).json({ approved: p, result: created });
    }
    if (p.type === 'update') {
      const payload = (p as UpdateProposal).payload;
      const updated = await updateEventOnTrainingCalendar(payload.event_id, {
        summary: payload.title_short,
        description: payload.description,
        startIso: payload.start_local,
        endIso: payload.end_local
      });
      proposals.splice(idx, 1);
      return res.status(200).json({ approved: p, result: updated });
    }
    if (p.type === 'delete') {
      const payload = (p as DeleteProposal).payload;
      await deleteEventFromTrainingCalendar(payload.event_id);
      proposals.splice(idx, 1);
      return res.status(200).json({ approved: p, result: { removed: payload.event_id } });
    }
    return res.status(400).json({ message: 'Unknown proposal type' });
  } catch (e: any) {
    return res.status(500).json({ message: 'Approval failed', error: e.message });
  }
};

export const rejectProposal = (req: Request, res: Response) => {
  const { proposal_id } = req.body || {};
  if (!proposal_id) return res.status(400).json({ message: 'Missing proposal_id' });
  const idx = proposals.findIndex(p => p.id === proposal_id);
  if (idx === -1) return res.status(404).json({ message: 'Proposal not found' });
  const removed = proposals.splice(idx, 1)[0];
  return res.status(200).json({ rejected: removed.id });
};


