import { Request, Response } from 'express';
import { tokensExist } from './google';
import { proposeCreateInternal } from './approvals';

function startOfNextWeekISO(timezoneOffsetMinutes?: number) {
  const now = new Date();
  const day = now.getDay(); // 0 Sun ... 6 Sat
  const daysToMonday = ((8 - day) % 7) || 7; // days to next Monday
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysToMonday);
  nextMonday.setHours(6, 0, 0, 0);
  return nextMonday.toISOString();
}

function addDays(iso: string, days: number, startHour: number, durationMin: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  d.setHours(startHour, 0, 0, 0);
  const start = new Date(d);
  const end = new Date(d.getTime() + durationMin * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export const planWeek = async (req: Request, res: Response) => {
  if (!tokensExist()) return res.status(401).json({ message: 'Not authenticated with Google. Visit /api/calendar/connect' });
  // Preferences parsing stub (future): req.body.preferences
  const base = startOfNextWeekISO();

  // Simple stub plan: Fri long run, Sat long ride, Sun swim
  const workouts = [
    { title: 'Run — Long (90m)', dayOffset: 4, startHour: 7, durationMin: 90, desc: 'Duration: 90 min\nTargets: Z2 steady\nIntervals: 1x90m\nNotes: Vegan fueling: dates\nTSS: 80, kcal: 900' },
    { title: 'Bike — Endurance (150m)', dayOffset: 5, startHour: 8, durationMin: 150, desc: 'Duration: 150 min\nTargets: Z2 endurance\nIntervals: 1x150m\nNotes: Vegan fueling: dates\nTSS: 120, kcal: 1500' },
    { title: 'Swim — Endurance (45m)', dayOffset: 6, startHour: 8, durationMin: 45, desc: 'Duration: 45 min\nTargets: steady aerobic\nIntervals: 3x10m swim / 5m pull\nNotes: Vegan fueling: dates\nTSS: 45, kcal: 400' }
  ];

  const results: Array<{ id: string; diff: string }> = [];
  const errors: Array<{ title: string; error: string }> = [];

  for (const w of workouts) {
    const { startIso, endIso } = addDays(base, w.dayOffset, w.startHour, w.durationMin);
    try {
      const { proposal, diff } = await proposeCreateInternal({
        title_short: w.title,
        start_local: startIso,
        end_local: endIso,
        description: w.desc
      });
      results.push({ id: proposal.id, diff });
    } catch (e: any) {
      errors.push({ title: w.title, error: e.message });
    }
  }

  const combinedDiff = results.map(r => r.diff).join('\n');
  return res.status(200).json({ proposals: results, combinedDiff, errors });
};


