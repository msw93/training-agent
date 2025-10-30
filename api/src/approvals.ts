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
  const maxHour = 21;
  return startHour >= minHour && endHour <= maxHour;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

async function checkConflicts(startIso: string, endIso: string) {
  const primaryEvents = await fetchPrimaryEvents(startIso, endIso);
  const blocking = primaryEvents.filter((ev: any) => {
    const evStart = ev.start?.dateTime || ev.start?.date;
    const evEnd = ev.end?.dateTime || ev.end?.date;
    if (!evStart || !evEnd) return false;
    if (!overlaps(startIso, endIso, evStart, evEnd)) return false;
    const title = (ev.summary || '').toLowerCase();
    return !title.includes('lunch');
  });
  return blocking.map((b: any) => ({ id: b.id, summary: b.summary, start: b.start, end: b.end }));
}

function eventSummaryForDiff(title?: string, start?: string, end?: string) {
  const s = start ? new Date(start).toLocaleString() : '—';
  const e = end ? new Date(end).toLocaleString() : '—';
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
  const conflicts = await checkConflicts(start_local, end_local);
  if (conflicts.length) {
    const err: any = new Error('Conflicts with primary (non-Lunch)');
    err.status = 409;
    err.conflicts = conflicts;
    throw err;
  }
  const id = uuidv4();
  const proposal: CreateProposal = {
    id,
    type: 'create',
    createdAt: new Date().toISOString(),
    payload: { title_short, start_local, end_local, description }
  };
  proposals.push(proposal);
  const diff = `Create → ${eventSummaryForDiff(title_short, start_local, end_local)}`;
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
    const conflicts = await checkConflicts(start_local, end_local);
    if (conflicts.length) return res.status(409).json({ message: 'Conflicts with primary (non-Lunch)', conflicts });
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


