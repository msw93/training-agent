import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import {
  createTrainingEvent,
  updateTrainingEvent,
  deleteTrainingEvent,
  listPrimaryBusy,
  listTrainingEvents
} from './routes';
import { getAuthUrl, exchangeCodeForTokens, tokensExist, getUserCalendarClient, listTrainingCalendarEvents } from './google';
import {
  listProposals,
  proposeCreate,
  proposeUpdate,
  proposeDelete,
  approveProposal,
  rejectProposal
} from './approvals';
import { planWeek } from './plan';
import { makePlanner } from './llm';
import { proposeCreateInternal } from './approvals';
import { rescheduleToValidSlot, findAvailableSlot, calculateDuration } from './scheduler';
import { checkEventSpacing } from './spacing';

dotenv.config();

// Validation helper to check if a workout meets time slot requirements
// Extracts hour/minute from ISO string to avoid timezone conversion issues
function parseTimeFromISO(iso: string): { hour: number; minute: number; day: number } {
  // Extract time from ISO string directly (format: YYYY-MM-DDTHH:MM:SS)
  const timeMatch = iso.match(/T(\d{2}):(\d{2})/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    // Get day of week from date part
    const dateMatch = iso.match(/(\d{4}-\d{2}-\d{2})/);
    const dateStr = dateMatch ? dateMatch[1] : '';
    const date = new Date(dateStr + 'T00:00:00'); // Parse date without timezone to get day
    return { hour, minute, day: date.getDay() };
  }
  // Fallback to Date parsing
  const d = new Date(iso);
  return { hour: d.getHours(), minute: d.getMinutes(), day: d.getDay() };
}

function isValidTimeSlot(start_local: string, end_local: string): boolean {
  const start = parseTimeFromISO(start_local);
  const end = parseTimeFromISO(end_local);
  const weekend = start.day === 0 || start.day === 6;
  
  if (!weekend) {
    // Weekdays: Morning (6:30-9:30 AM) OR evening (6:00 PM onwards)
    const isMorning = (start.hour > 6 || (start.hour === 6 && start.minute >= 30)) && 
                      (end.hour < 9 || (end.hour === 9 && end.minute <= 30));
    if (isMorning) return true;
    
    const isEvening = start.hour >= 18;
    return isEvening;
  }
  
  // Weekends: ANY time is allowed
  return true;
}

const app = express();
const port = process.env.PORT || 4100;

app.use(cors());
app.use(bodyParser.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Core endpoints
app.post('/api/calendar/create_training_event', createTrainingEvent);
app.post('/api/calendar/update_training_event', updateTrainingEvent);
app.post('/api/calendar/delete_training_event', deleteTrainingEvent);
app.get('/api/calendar/list_primary_busy', listPrimaryBusy);
app.get('/api/calendar/list_training_events', listTrainingEvents);

// Google OAuth: Step 1
app.get('/api/calendar/connect', (req, res) => {
  try {
    const url = getAuthUrl();
    res.redirect(url);
  } catch (e) {
    res.status(500).send('OAuth URL generation failed: ' + (e as any).message);
  }
});

// Google OAuth: Step 2
app.get('/api/calendar/oauth2callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    await exchangeCodeForTokens(code as string);
    res.send('Google Authenticated! You can close this tab.');
  } catch (e) {
    res.status(500).send('OAuth failed: ' + (e as any).message);
  }
});

// Check auth status
app.get('/api/calendar/auth_status', (req, res) => {
  res.json({ authenticated: tokensExist() });
});

// Simple test endpoint to list user calendars
app.get('/api/calendar/test_gcal', async (req, res) => {
  if (!tokensExist()) return res.status(401).send('Not authenticated. Go to /api/calendar/connect first.');
  try {
    const calendar = getUserCalendarClient();
    const result = await calendar.calendarList.list();
    res.json(result.data);
  } catch (e) {
    res.status(500).send('Failed to list calendars: ' + (e as any).message);
  }
});

// Approvals & Diff endpoints
app.get('/api/approvals/list', listProposals);
app.post('/api/approvals/propose_create', proposeCreate);
app.post('/api/approvals/propose_update', proposeUpdate);
app.post('/api/approvals/propose_delete', proposeDelete);
app.post('/api/approvals/approve', approveProposal);
app.post('/api/approvals/reject', rejectProposal);

// Weekly plan stub (proposals only)
app.post('/api/plan/week', planWeek);

// LLM endpoint: accept NL prompt, return proposals + combined diff
app.post('/api/llm/plan', async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ message: 'Missing prompt' });
    const planner = makePlanner();
    let items: any[] = [];
    let source: 'openai' | 'fallback' = 'openai';
    let openaiError: string | undefined = undefined;
    try {
      items = await planner.generateWeekPlan({ prompt });
    } catch (_e: any) {
      openaiError = _e?.message || String(_e);
      // Fallback: use rule-based planner explicitly
      const { makePlanner: make } = await import('./llm');
      // Temporarily force rule-based by unsetting the env var
      const prev = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      const fallback = make();
      if (prev) process.env.OPENAI_API_KEY = prev;
      items = await fallback.generateWeekPlan({ prompt });
      source = 'fallback';
    }
    console.log('[Planner] Received items from LLM planner:', {
      itemsCount: items.length,
      source,
      openaiError
    });
    
    // Validate workout count against prompt
    const extractWorkoutCount = (promptText: string): number | null => {
      const lower = promptText.toLowerCase();
      const exactMatch = lower.match(/(\d+)\s*(workouts?|sessions?)/);
      if (exactMatch) {
        return parseInt(exactMatch[1], 10);
      }
      const swimMatch = lower.match(/(\d+)\s*swims?/);
      const runMatch = lower.match(/(\d+)\s*runs?/);
      const rideMatch = lower.match(/(\d+)\s*(rides?|bikes?)/);
      if (swimMatch && runMatch && rideMatch) {
        return parseInt(swimMatch[1], 10) + parseInt(runMatch[1], 10) + parseInt(rideMatch[1], 10);
      }
      return null;
    };
    
    const requestedCount = extractWorkoutCount(prompt);
    console.log(`[Planner][Count] Extracted requested count: ${requestedCount ?? 'none'}, LLM returned: ${items.length}`);
    if (requestedCount !== null) {
      if (items.length !== requestedCount) {
        console.warn('[Planner][Count] ⚠️ MISMATCH DETECTED:', {
          requestedCount,
          returnedCount: items.length,
          difference: items.length - requestedCount,
          prompt
        });
        
        // If we got MORE than requested, trim to requested count
        if (items.length > requestedCount) {
          console.warn(`[Planner][Count] Trimming ${items.length - requestedCount} extra workouts to match requested count of ${requestedCount}`);
          items = items.slice(0, requestedCount);
        } else {
          // If we got LESS than requested, log but keep what we have
          console.warn(`[Planner][Count] Got ${items.length} but requested ${requestedCount} - LLM generated fewer workouts than requested`);
        }
      } else {
        console.log('[Planner][Count] ✓ Workout count matches requested count:', requestedCount);
      }
    }
    
    // Get existing events for conflict checking
    const existingGcalEvents = await listTrainingCalendarEvents();
    const existingEvents = existingGcalEvents.map((e: any) => ({
      start_local: e.start?.dateTime || e.start?.date,
      end_local: e.end?.dateTime || e.end?.date,
      summary: e.summary || ''
    }));
    
    // Helper to check spacing against existing events
    const checkSpacing = (workout: any) => {
      return checkEventSpacing(
        {
          start_local: workout.start_local,
          end_local: workout.end_local,
          summary: workout.title_short
        },
        existingEvents
      );
    };
    
    const results: Array<{ id: string; diff: string; event: any; allDayWarnings?: any[] }> = [];
    const skipped: string[] = []; // Track items we couldn't schedule
    
    // Check if prompt explicitly requests early morning times
    const promptLower = prompt.toLowerCase();
    const explicitEarlyRequest = promptLower.includes('6:30') || 
                                  promptLower.includes('6.30') || 
                                  promptLower.includes('0630') ||
                                  promptLower.includes('early morning') ||
                                  promptLower.includes('before 7');
    console.log('[Planner][TimeBias] Early request detected?', {
      explicitEarlyRequest,
      promptSample: prompt.slice(0, 120)
    });
    
    for (const it of items) {
      console.log('[Planner] Processing raw LLM item:', {
        title: it.title_short,
        start: it.start_local,
        end: it.end_local
      });
      
      // Check if workout starts before 7:00 AM and enforce preference
      const startParsed = parseTimeFromISO(it.start_local);
      const startsBefore7 = startParsed.hour < 7 || (startParsed.hour === 6 && startParsed.minute >= 30);
      const isWeekendWorkout = startParsed.day === 0 || startParsed.day === 6;
      const workoutDuration = calculateDuration(it.start_local, it.end_local);
      const isLongWorkout = workoutDuration >= 180; // 3+ hours (e.g., 4-hour long ride)
      const isLongWeekendWorkout = isWeekendWorkout && isLongWorkout;
      
      if (startsBefore7 && !explicitEarlyRequest && !isWeekendWorkout) {
        console.log('[Scheduler] Enforcing weekday 7am preference:', {
          title: it.title_short,
          originalStart: it.start_local,
          originalEnd: it.end_local
        });
        // Reschedule to 7:00 AM
        const duration = calculateDuration(it.start_local, it.end_local);
        const dateStr = it.start_local.split('T')[0];
        const tzMatch = it.start_local.match(/([+-]\d{2}:\d{2})$/);
        const timezone = tzMatch ? tzMatch[1] : '-05:00';
        const newStartHour = 7;
        const newStartMinute = 0;
        const endHour = newStartHour + Math.floor(duration / 60);
        const endMinute = newStartMinute + (duration % 60);
        const finalEndHour = endHour + Math.floor(endMinute / 60);
        const finalEndMinute = endMinute % 60;
        
        // Check if workout would still fit in morning slot (must end by 9:30 AM)
        if (finalEndHour < 9 || (finalEndHour === 9 && finalEndMinute <= 30)) {
          const newStart = `${dateStr}T07:00:00${timezone}`;
          const newEnd = `${dateStr}T${String(finalEndHour).padStart(2, '0')}:${String(finalEndMinute).padStart(2, '0')}:00${timezone}`;
          it.start_local = newStart;
          it.end_local = newEnd;
          console.log('[Scheduler] Rescheduled weekday workout to preference:', {
            title: it.title_short,
            newStart,
            newEnd
          });
        } else {
          // Workout too long for morning - try evening
          console.log('[Scheduler] Workout too long for 7:00 AM slot, evening reschedule will be attempted later:', {
            title: it.title_short,
            durationMinutes: duration
          });
        }
      } else if (startsBefore7 && isWeekendWorkout && !explicitEarlyRequest && !isLongWeekendWorkout) {
        // Weekend workouts also prefer 7:00 AM unless it's a long workout
        console.log('[Scheduler] Enforcing weekend 7am preference:', {
          title: it.title_short,
          originalStart: it.start_local,
          originalEnd: it.end_local
        });
        const duration = calculateDuration(it.start_local, it.end_local);
        const dateStr = it.start_local.split('T')[0];
        const tzMatch = it.start_local.match(/([+-]\d{2}:\d{2})$/);
        const timezone = tzMatch ? tzMatch[1] : '-05:00';
        const newStart = `${dateStr}T07:00:00${timezone}`;
        const endHour = 7 + Math.floor(duration / 60);
        const endMinute = duration % 60;
        const finalEndHour = endHour + Math.floor(endMinute / 60);
        const finalEndMinute = endMinute % 60;
        const newEnd = `${dateStr}T${String(finalEndHour).padStart(2, '0')}:${String(finalEndMinute).padStart(2, '0')}:00${timezone}`;
        it.start_local = newStart;
        it.end_local = newEnd;
        console.log('[Scheduler] Rescheduled weekend workout to preference:', {
          title: it.title_short,
          newStart,
          newEnd
        });
      }
      
      let workoutToSchedule = {
        ...it,
        duration_minutes: calculateDuration(it.start_local, it.end_local)
      };
      
      // Try to create proposal
      let attempt = 0;
      let success = false;
      
      while (attempt < 3 && !success) {
        try {
          // Check spacing before creating proposal
          const spacingCheck = checkSpacing(workoutToSchedule);
          if (!spacingCheck.valid) {
            console.log('[Scheduler] Spacing violation detected:', {
              title: it.title_short,
              warnings: spacingCheck.warnings
            });
            
            // Try to find a slot with proper spacing
            const rescheduled = await findAvailableSlot(workoutToSchedule, existingEvents);
            if (rescheduled) {
              // Check spacing again for rescheduled event
              const newSpacingCheck = checkEventSpacing(
                {
                  start_local: rescheduled.start_local,
                  end_local: rescheduled.end_local,
                  summary: rescheduled.title_short
                },
                existingEvents
              );
              
              if (newSpacingCheck.valid) {
                workoutToSchedule = rescheduled;
                attempt++;
                continue;
              } else {
                console.log('[Scheduler] Rescheduled slot still has spacing issues:', {
                  title: it.title_short,
                  warnings: newSpacingCheck.warnings
                });
                // Try once more
                attempt++;
                continue;
              }
            } else {
              console.log('[Scheduler] Unable to find slot with proper spacing, skipping workout:', {
                title: it.title_short
              });
              skipped.push(it.title_short);
              break;
            }
          }
          
          const { proposal, diff } = await proposeCreateInternal(workoutToSchedule);
          console.log('[Planner] Created proposal:', {
            proposalId: proposal.id,
            title: workoutToSchedule.title_short,
            start: workoutToSchedule.start_local,
            end: workoutToSchedule.end_local,
            diff
          });
          if ((proposal as any).allDayWarnings && (proposal as any).allDayWarnings.length > 0) {
            console.log('[Planner] Proposal has all-day warnings:', {
              proposalId: proposal.id,
              warnings: (proposal as any).allDayWarnings
            });
          }
          results.push({ 
            id: proposal.id, 
            diff,
            event: workoutToSchedule, // Include full event details
            allDayWarnings: (proposal as any).allDayWarnings || []
          });
          
          // Add to existing events to check future conflicts
          existingEvents.push({
            start_local: workoutToSchedule.start_local,
            end_local: workoutToSchedule.end_local,
            summary: workoutToSchedule.title_short
          });
          
          success = true;
        } catch (e: any) {
          console.log('[Planner] Attempt failed:', {
            attempt: attempt + 1,
            title: it.title_short,
            error: e.message
          });
          if (e.conflicts && Array.isArray(e.conflicts) && e.conflicts.length > 0) {
            console.log('[Planner] Conflict details:', e.conflicts.map((c: any) => 
              `"${c.summary}" at ${c.start?.dateTime || c.start?.date}`
            ).join(', '));
          }
          
          // Auto-reschedule if conflict or time constraint
          if (e.message.includes('Conflicts') || e.message.includes('Outside allowed hours')) {
            console.log('[Scheduler] Auto-rescheduling due to conflict/time constraint:', {
              title: it.title_short
            });
            const rescheduled = await findAvailableSlot(workoutToSchedule, existingEvents);
            
            if (rescheduled) {
              workoutToSchedule = rescheduled;
              attempt++;
            } else {
              console.log('[Scheduler] Could not find valid slot after auto-reschedule attempts, skipping:', {
                title: it.title_short
              });
              skipped.push(it.title_short);
              break;
            }
          } else {
            // Other errors (validation, etc.) - skip this workout
            console.log('[Planner] Skipping workout due to non-reschedulable error:', {
              title: it.title_short,
              error: e.message
            });
            skipped.push(it.title_short);
            break;
          }
        }
      }
      
      if (!success && attempt >= 3) {
        console.log('[Planner] Exhausted attempts for workout, skipping:', {
          title: it.title_short
        });
        skipped.push(it.title_short);
      }
    }
    
    console.log('[Planner] Proposal creation summary:', {
      proposalsCreated: results.length,
      skippedCount: skipped.length
    });
    if (skipped.length > 0) {
      console.log('[Planner] Skipped workouts list:', skipped);
    }
    
    // Final validation: filter out any proposals that don't meet time slot requirements
    let validResults = results.filter(r => {
      const valid = isValidTimeSlot(r.event.start_local, r.event.end_local);
      if (!valid) {
        console.log('[Validator] Filtering out proposal due to time slot violation:', {
          title: r.event.title_short,
          start: r.event.start_local,
          end: r.event.end_local
        });
        skipped.push(r.event.title_short);
      }
      return valid;
    });
    
    if (validResults.length < results.length) {
      console.log('[Validator] Removed proposals during validation:', {
        removed: results.length - validResults.length,
        finalCount: validResults.length
      });
    }
    
    // If we have more than requested, prioritize keeping the first N valid ones
    if (requestedCount !== null && validResults.length > requestedCount) {
      console.warn('[Validator][Count] Final count exceeds requested - trimming to exact count:', {
        requestedCount,
        beforeTrim: validResults.length,
        trimmedCount: validResults.length - requestedCount
      });
      validResults = validResults.slice(0, requestedCount);
    }
    
    const combinedDiff = validResults.map(r => r.diff).join('\n');
    
        // Validate final count
        const finalCount = validResults.length;
        
        const countWarning = requestedCount !== null && finalCount !== requestedCount
          ? `Expected ${requestedCount} workouts but got ${finalCount} (${skipped.length} skipped)`
          : null;
        if (countWarning) {
          console.warn('[Validator][Count] Final count warning:', {
            requestedCount,
            actualCount: finalCount,
            skipped
          });
        } else {
          console.log('[Validator][Count] ✓ Final count matches requested count:', {
            requestedCount,
            actualCount: finalCount
          });
        }
        
        // Only send validated proposals to frontend
        return res.status(200).json({ 
          proposals: validResults, 
          combinedDiff, 
          source, 
          openaiError,
          skippedCount: skipped.length,
          requestedCount: requestedCount,
          actualCount: finalCount,
          countWarning: countWarning
        });
  } catch (e: any) {
    return res.status(500).json({ message: 'LLM plan failed', error: e.message });
  }
});

// LLM modify endpoint: accept NL instruction + existing events, return proposals
app.post('/api/llm/modify', async (req, res) => {
  try {
    const { instruction } = req.body || {};
    if (!instruction) return res.status(400).json({ message: 'Missing instruction' });
    
    console.log(`[LLM Modify] Received instruction: "${instruction}"`);
    
    // Get existing events from training calendar
    const existingGcalEvents = await listTrainingCalendarEvents({ maxResults: 50 });
    const existingEvents = existingGcalEvents
      .filter((e: any) => e.start?.dateTime) // Only timed events (not all-day)
      .map((e: any) => ({
        event_id: e.id,
        title_short: e.summary || 'Untitled',
        start_local: e.start.dateTime,
        end_local: e.end?.dateTime || e.end?.date,
        description: e.description || ''
      }));
    
    console.log(`[LLM Modify] Found ${existingEvents.length} existing events`);
    
    if (existingEvents.length === 0) {
      return res.status(400).json({ message: 'No existing events found to modify' });
    }
    
    const planner = makePlanner();
    let modifications: any[] = [];
    let source: 'openai' | 'fallback' = 'openai';
    let openaiError: string | undefined = undefined;
    
    try {
      modifications = await planner.modifyWeekPlan({ instruction, existingEvents });
      console.log(`[LLM Modify] Generated ${modifications.length} modifications`);
    } catch (_e: any) {
      openaiError = _e?.message || String(_e);
      console.error(`[LLM Modify] OpenAI failed: ${openaiError}. Falling back to rule-based planner.`);
      // Fallback: use rule-based planner explicitly
      const { makePlanner: make } = await import('./llm');
      const prev = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      const fallback = make();
      if (prev) process.env.OPENAI_API_KEY = prev;
      modifications = await fallback.modifyWeekPlan({ instruction, existingEvents });
      source = 'fallback';
      console.log(`[LLM Modify] Fallback planner generated ${modifications.length} modifications`);
    }
    
    const approvalsModule = await import('./approvals');
    const proposeUpdateInternal = approvalsModule.proposeUpdateInternal;
    const proposeDeleteInternal = approvalsModule.proposeDeleteInternal;
    const proposeCreateInternal = approvalsModule.proposeCreateInternal;
    const results: Array<{ id: string; diff: string; event?: any; allDayWarnings?: any[] }> = [];
    const errors: Array<{ action: string; error: string }> = [];
    
    for (const mod of modifications) {
      try {
        console.log(`[LLM Modify] Processing modification: ${mod.action} for event_id ${mod.event_id || 'new event'}`);
        
        if (mod.action === 'delete') {
          // Create delete proposal
          const { proposal, diff } = await proposeDeleteInternal(mod.event_id!);
          results.push({ id: proposal.id, diff });
        } else if (mod.action === 'update') {
          // Create update proposal
          const { proposal, diff } = await proposeUpdateInternal({
            event_id: mod.event_id!,
            title_short: mod.title_short,
            start_local: mod.start_local,
            end_local: mod.end_local,
            description: mod.description
          });
          results.push({ id: proposal.id, diff });
        } else if (mod.action === 'create') {
          // Create new event proposal
          if (!mod.title_short || !mod.start_local || !mod.end_local || !mod.description) {
            throw new Error('Missing required fields for create action');
          }
          const { proposal, diff } = await proposeCreateInternal({
            title_short: mod.title_short,
            start_local: mod.start_local,
            end_local: mod.end_local,
            description: mod.description
          });
          results.push({ id: proposal.id, diff });
        }
      } catch (e: any) {
        console.error(`[LLM Modify] Failed to create proposal for ${mod.action}:`, e.message);
        errors.push({ action: mod.action, error: e.message });
      }
    }
    
    const combinedDiff = results.map(r => r.diff).join('\n');
    
    return res.status(200).json({
      proposals: results,
      combinedDiff,
      source,
      openaiError,
      errors,
      modificationsCount: modifications.length,
      proposalsCount: results.length
    });
  } catch (e: any) {
    console.error(`[LLM Modify] Request failed:`, e.message);
    return res.status(500).json({ message: 'LLM modify failed', error: e.message });
  }
});

// LLM status diagnostics
app.get('/api/llm/status', (req, res) => {
  res.json({
    hasKey: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    debug: process.env.LLM_DEBUG === '1',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 10000)
  });
});

// TODO: Add more (weather, holidays, notification etc.)

app.listen(port, () => {
  console.log(`Express API listening at http://localhost:${port}`);
});
