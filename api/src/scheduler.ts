// Auto-scheduling logic to resolve conflicts and invalid times

import { checkEventSpacing, MIN_GAP_MINUTES } from './spacing';

interface WorkoutToSchedule {
  title_short: string;
  start_local: string;
  end_local: string;
  description: string;
  duration_minutes?: number;
}

// Time slot definitions
const VALID_TIME_SLOTS = {
  weekday: [
    { startHour: 6, startMinute: 30, endHour: 9, endMinute: 30 }, // Morning: 6:30-9:30 AM
    { startHour: 18, startMinute: 0, endHour: 23, endMinute: 59 }  // Evening: 6:00 PM onwards
  ],
  weekend: [
    // Weekends: any time allowed, but we'll prefer morning
    { startHour: 6, startMinute: 30, endHour: 9, endMinute: 30 }, // Morning: 6:30-9:30 AM (preferred)
    { startHour: 0, startMinute: 0, endHour: 23, endMinute: 59 }  // Any time (for validation)
  ]
};

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isInValidTimeSlot(startDate: Date, endDate: Date): boolean {
  const weekend = isWeekend(startDate);
  const slots = weekend ? VALID_TIME_SLOTS.weekend : VALID_TIME_SLOTS.weekday;
  
  const startHour = startDate.getHours();
  const startMinute = startDate.getMinutes();
  const endHour = endDate.getHours();
  const endMinute = endDate.getMinutes();
  
  for (const slot of slots) {
    // Check if workout starts at or after slot start
    const startsInSlot = startHour > slot.startHour || 
                         (startHour === slot.startHour && startMinute >= slot.startMinute);
    
    // Check if workout ends at or before slot end
    const endsInSlot = endHour < slot.endHour || 
                       (endHour === slot.endHour && endMinute <= slot.endMinute);
    
    if (startsInSlot && endsInSlot) {
      return true;
    }
  }
  
  return false;
}

export function calculateDuration(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
}

// Helper function to parse time from ISO string (same as in other files)
function parseTimeFromISO(iso: string): { hour: number; minute: number; day: number } {
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

// Helper to create ISO string in America/Toronto timezone (preserve timezone from original or default to -04:00/-05:00)
function createISOString(dateStr: string, hour: number, minute: number, second: number = 0): string {
  // Extract date and timezone from original
  const dateMatch = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
  const tzMatch = dateStr.match(/([+-]\d{2}:\d{2})$/);
  const timezone = tzMatch ? tzMatch[1] : '-05:00'; // Default to EST if not found
  
  if (!dateMatch) return dateStr; // Fallback if can't parse
  
  const date = dateMatch[1];
  const hourStr = String(hour).padStart(2, '0');
  const minStr = String(minute).padStart(2, '0');
  const secStr = String(second).padStart(2, '0');
  
  return `${date}T${hourStr}:${minStr}:${secStr}${timezone}`;
}

export function rescheduleToValidSlot(workout: WorkoutToSchedule): WorkoutToSchedule {
  // Parse time from ISO string directly (not using Date to avoid timezone conversion)
  const startParsed = parseTimeFromISO(workout.start_local);
  const endParsed = parseTimeFromISO(workout.end_local);
  const duration = workout.duration_minutes || calculateDuration(workout.start_local, workout.end_local);
  
  // Check if already valid using ISO string parsing
  const weekend = startParsed.day === 0 || startParsed.day === 6;
  // Morning: start >= 6:30 AND end <= 9:30
  const morningStart = startParsed.hour > 6 || (startParsed.hour === 6 && startParsed.minute >= 30);
  const morningEnd = endParsed.hour < 9 || (endParsed.hour === 9 && endParsed.minute <= 30);
  const isMorning = morningStart && morningEnd;
  const isEvening = !weekend && startParsed.hour >= 18;
  const isValid = weekend || isMorning || isEvening;
  
  if (isValid) {
    return workout;
  }
  
  console.log(`[Scheduler] Rescheduling "${workout.title_short}" from ${workout.start_local} (invalid time)`);
  
  if (!weekend) {
    // Weekdays: Try morning first (prefer 7:00 AM start, allow 6:30 if needed), then evening (6:00 PM+)
    // Check if workout fits in morning slot starting at 7:00 AM
    const preferredStartHour = 7;
    const preferredStartMinute = 0;
    const morningEndHour = preferredStartHour + Math.floor(duration / 60);
    const morningEndMinute = preferredStartMinute + (duration % 60);
    const finalEndHour = morningEndHour + Math.floor(morningEndMinute / 60);
    const finalEndMinute = morningEndMinute % 60;
    
    // Check if workout fits starting at 7:00 AM (must end by 9:30 AM)
    if (finalEndHour < 9 || (finalEndHour === 9 && finalEndMinute <= 30)) {
      const newStart = createISOString(workout.start_local, preferredStartHour, preferredStartMinute);
      const newEnd = createISOString(workout.start_local, finalEndHour, finalEndMinute);
      console.log(`[Scheduler] Moved to morning (7:00 AM): ${newStart}`);
      return {
        ...workout,
        start_local: newStart,
        end_local: newEnd
      };
    }
    
    // If 7:00 AM doesn't work, try 6:30 AM as fallback (but only if necessary)
    const fallbackStartHour = 6;
    const fallbackStartMinute = 30;
    const fallbackEndHour = fallbackStartHour + Math.floor((duration + 30) / 60);
    const fallbackEndMinute = (duration + 30) % 60;
    
    if (fallbackEndHour < 9 || (fallbackEndHour === 9 && fallbackEndMinute <= 30)) {
      const newStart = createISOString(workout.start_local, fallbackStartHour, fallbackStartMinute);
      const newEnd = createISOString(workout.start_local, fallbackEndHour, fallbackEndMinute);
      console.log(`[Scheduler] Moved to morning (6:30 AM fallback): ${newStart}`);
      return {
        ...workout,
        start_local: newStart,
        end_local: newEnd
      };
    }
    
    // If morning doesn't work, try evening (6:00 PM onwards)
    const newStart = createISOString(workout.start_local, 18, 0);
    const endHour = 18 + Math.floor(duration / 60);
    const endMinute = duration % 60;
    const newEnd = createISOString(workout.start_local, endHour, endMinute);
    console.log(`[Scheduler] Moved to evening: ${newStart}`);
    return {
      ...workout,
      start_local: newStart,
      end_local: newEnd
    };
  } else {
    // Weekends: Try morning first (prefer 7:00 AM), but any time is valid
    const preferredStartHour = 7;
    const preferredStartMinute = 0;
    const morningEndHour = preferredStartHour + Math.floor(duration / 60);
    const morningEndMinute = preferredStartMinute + (duration % 60);
    const finalEndHour = morningEndHour + Math.floor(morningEndMinute / 60);
    const finalEndMinute = morningEndMinute % 60;
    
    // Check if workout fits starting at 7:00 AM
    if (finalEndHour < 12) { // Weekends: morning window extends until noon
      const newStart = createISOString(workout.start_local, preferredStartHour, preferredStartMinute);
      const newEnd = createISOString(workout.start_local, finalEndHour, finalEndMinute);
      console.log(`[Scheduler] Moved to weekend morning (7:00 AM): ${newStart}`);
      return {
        ...workout,
        start_local: newStart,
        end_local: newEnd
      };
    }
    
    // If 7:00 AM doesn't work, try 6:30 AM as fallback
    const fallbackStartHour = 6;
    const fallbackStartMinute = 30;
    const fallbackEndHour = fallbackStartHour + Math.floor((duration + 30) / 60);
    const fallbackEndMinute = (duration + 30) % 60;
    
    if (fallbackEndHour < 12) {
      const newStart = createISOString(workout.start_local, fallbackStartHour, fallbackStartMinute);
      const newEnd = createISOString(workout.start_local, fallbackEndHour, fallbackEndMinute);
      console.log(`[Scheduler] Moved to weekend morning (6:30 AM fallback): ${newStart}`);
      return {
        ...workout,
        start_local: newStart,
        end_local: newEnd
      };
    }
    
    // If morning doesn't fit, keep original time (weekends allow any time)
    console.log(`[Scheduler] Weekend workout - keeping original time: ${workout.start_local}`);
    return workout;
  }
}

// Helper to add days to a date string
function addDaysToISO(iso: string, days: number): string {
  const dateMatch = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  const tzMatch = iso.match(/([+-]\d{2}:\d{2})$/);
  if (!dateMatch) return iso;
  
  const timezone = tzMatch ? tzMatch[1] : '-05:00';
  const year = parseInt(dateMatch[1], 10);
  const month = parseInt(dateMatch[2], 10);
  const day = parseInt(dateMatch[3], 10);
  
  const date = new Date(year, month - 1, day + days);
  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, '0');
  const newDay = String(date.getDate()).padStart(2, '0');
  
  // Keep the time part from original
  const timeMatch = iso.match(/T(\d{2}:\d{2}:\d{2})/);
  const time = timeMatch ? timeMatch[1] : '07:00:00'; // Default to 7:00 AM
  
  return `${newYear}-${newMonth}-${newDay}T${time}${timezone}`;
}

export async function findAvailableSlot(
  workout: WorkoutToSchedule,
  existingEvents: Array<{ start_local: string; end_local: string; summary?: string }>,
  maxAttempts: number = 14 // Try for 2 weeks
): Promise<WorkoutToSchedule | null> {
  let attempt = 0;
  let candidate = rescheduleToValidSlot(workout);
  const duration = workout.duration_minutes || calculateDuration(workout.start_local, workout.end_local);
  const isLongWorkout = duration >= 180; // 3+ hours
  const isWeekend = parseTimeFromISO(candidate.start_local).day === 0 || parseTimeFromISO(candidate.start_local).day === 6;
  
  // For long weekend workouts, try earlier start times if needed
  const originalDate = candidate.start_local.split('T')[0];
  const tzMatch = candidate.start_local.match(/([+-]\d{2}:\d{2})$/);
  const timezone = tzMatch ? tzMatch[1] : '-05:00';
  
  while (attempt < maxAttempts) {
    // Parse times from ISO strings directly (avoid timezone conversion)
    const candidateParsed = parseTimeFromISO(candidate.start_local);
    
    // Check for conflicts AND spacing with existing events
    const spacingCheck = checkEventSpacing(
      {
        start_local: candidate.start_local,
        end_local: candidate.end_local,
        summary: candidate.title_short
      },
      existingEvents.map(e => ({
        start_local: e.start_local,
        end_local: e.end_local,
        summary: e.summary || ''
      }))
    );
    
    if (spacingCheck.valid) {
      console.log(`[Scheduler] Found available slot with proper spacing after ${attempt + 1} attempts: ${candidate.start_local}`);
      return candidate;
    } else {
      console.log(`[Scheduler] Slot has spacing issues: ${spacingCheck.warnings.join('; ')}`);
    }
    
    attempt++;
    
    // Strategy 1: Find conflicts on the same day and try to schedule before them or with proper gap after
    const candidateDate = candidate.start_local.split('T')[0];
    const sameDayEvents = existingEvents.filter(e => e.start_local.startsWith(candidateDate));
    
    if (sameDayEvents.length > 0) {
      // Find the earliest event on this day that conflicts
      sameDayEvents.sort((a, b) => new Date(a.start_local).getTime() - new Date(b.start_local).getTime());
      const firstEvent = sameDayEvents[0];
      const firstEventStart = parseTimeFromISO(firstEvent.start_local);
      
      // Try scheduling BEFORE the first event (with proper gap)
      const tryBeforeHour = firstEventStart.hour;
      const tryBeforeMinute = firstEventStart.minute;
      const tryBeforeStart = Math.max(7, tryBeforeHour); // Don't go earlier than 7 AM
      
      // Calculate if workout would fit before first event
      const endIfBefore = tryBeforeStart + Math.floor(duration / 60);
      const endMinIfBefore = (tryBeforeMinute || 0) + (duration % 60);
      const calcFinalEndHour = endIfBefore + Math.floor(endMinIfBefore / 60);
      const calcFinalEndMin = endMinIfBefore % 60;
      
      // Check if it would end before first event starts (with 30 min gap)
      const gapNeeded = 30; // minutes
      const firstEventStartMinutes = firstEventStart.hour * 60 + firstEventStart.minute;
      const candidateEndMinutes = calcFinalEndHour * 60 + calcFinalEndMin + gapNeeded;
      
      if (candidateEndMinutes <= firstEventStartMinutes) {
        // Can fit before first event
        // For long weekend workouts, allow earlier than 7 AM if needed
        const actualStartHour = (isLongWorkout && isWeekend) ? Math.max(6, tryBeforeStart - Math.floor((duration + 30) / 60)) : Math.max(7, tryBeforeStart);
        const actualStartMinute = (isLongWorkout && isWeekend && actualStartHour < 7) ? 30 : 0;
        const newStartISO = createISOString(candidateDate + 'T00:00:00', actualStartHour, actualStartMinute);
        const recalcEndHour2 = actualStartHour + Math.floor(duration / 60);
        const recalcEndMin2 = actualStartMinute + (duration % 60);
        const recalcFinalEndHour2 = recalcEndHour2 + Math.floor(recalcEndMin2 / 60);
        const recalcFinalEndMin2 = recalcEndMin2 % 60;
        const newEndISO = createISOString(newStartISO, recalcFinalEndHour2, recalcFinalEndMin2);
        candidate = {
          ...candidate,
          start_local: newStartISO,
          end_local: newEndISO
        };
        console.log(`[Scheduler] Scheduling before first event: ${candidate.title_short} at ${newStartISO}`);
        continue;
      }
      
      // If can't fit before, try scheduling EARLIER (before 7 AM for long weekend workouts)
      if (isLongWorkout && isWeekend) {
        // Long weekend workout - try 6:30 AM or 6:00 AM
        const earlyStartHour = 6;
        const earlyStartMinute = 30;
        const earlyEndHour = earlyStartHour + Math.floor(duration / 60);
        const earlyEndMin = earlyStartMinute + (duration % 60);
        const earlyFinalEndHour = earlyEndHour + Math.floor(earlyEndMin / 60);
        const earlyFinalEndMin = earlyEndMin % 60;
        const earlyEndMinutes = earlyFinalEndHour * 60 + earlyFinalEndMin;
        
        if (earlyEndMinutes + 30 <= firstEventStartMinutes) {
          // Can fit if we start at 6:30 AM
          const newStartISO = createISOString(candidateDate + 'T00:00:00', earlyStartHour, earlyStartMinute);
          const newEndISO = createISOString(newStartISO, earlyFinalEndHour, earlyFinalEndMin);
          candidate = {
            ...candidate,
            start_local: newStartISO,
            end_local: newEndISO
          };
          console.log(`[Scheduler] Scheduling long weekend workout early at 6:30 AM: ${candidate.title_short} at ${newStartISO}`);
          continue;
        }
      }
      
      // Strategy 2: Try AFTER all events on the same day (with proper gap)
      const latestEventOnDay = sameDayEvents.reduce((latest, event) => {
        const eventEnd = new Date(event.end_local);
        const latestEnd = new Date(latest.end_local);
        return eventEnd > latestEnd ? event : latest;
      }, sameDayEvents[0]);
      
      const latestEndTime = parseTimeFromISO(latestEventOnDay.end_local);
      const gapAfter = 30; // minutes
      let newStartHour = latestEndTime.hour;
      let newStartMinute = latestEndTime.minute + gapAfter;
      
      if (newStartMinute >= 60) {
        newStartHour += 1;
        newStartMinute -= 60;
      }
      
      // Calculate if workout would fit after the last event
      const endAfterHour = newStartHour + Math.floor(duration / 60);
      const endAfterMin = newStartMinute + (duration % 60);
      const finalEndAfterHour = endAfterHour + Math.floor(endAfterMin / 60);
      const finalEndAfterMin = endAfterMin % 60;
      
      // Check if this time would conflict with any events
      const wouldOverlap = sameDayEvents.some(event => {
        const eventStart = parseTimeFromISO(event.start_local);
        const eventEnd = parseTimeFromISO(event.end_local);
        // Check if new workout would overlap with existing event
        const newStartMinutes = newStartHour * 60 + newStartMinute;
        const newEndMinutes = finalEndAfterHour * 60 + finalEndAfterMin;
        const eventStartMinutes = eventStart.hour * 60 + eventStart.minute;
        const eventEndMinutes = eventEnd.hour * 60 + eventEnd.minute;
        return (newStartMinutes < eventEndMinutes && newEndMinutes > eventStartMinutes);
      });
      
      // For weekend long workouts, allow scheduling after events (even if afternoon)
      // For weekdays, check if it's in blocked period
      const weekend = isWeekend;
      if (!weekend && newStartHour >= 9 && newStartHour < 18) {
        // Blocked period on weekday - move to evening
        newStartHour = 18;
        newStartMinute = 0;
      } else if (!weekend && newStartHour < 7) {
        // Too early on weekday - move to 7 AM
        newStartHour = 7;
        newStartMinute = 0;
      }
      
      // If workout would fit after events and not overlap, use that time
      // OR if it's a weekend and we're past morning (afternoon), that's fine too
      if (!wouldOverlap && (weekend || newStartHour >= 18 || (newStartHour >= 7 && newStartHour < 9))) {
        const newStartISO = createISOString(candidateDate + 'T00:00:00', newStartHour, newStartMinute);
        const endHour2 = newStartHour + Math.floor(duration / 60);
        const endMinute2 = newStartMinute + (duration % 60);
        const finalEndHour2 = endHour2 + Math.floor(endMinute2 / 60);
        const finalEndMin2 = endMinute2 % 60;
        const newEndISO = createISOString(newStartISO, finalEndHour2, finalEndMin2);
        candidate = {
          ...candidate,
          start_local: newStartISO,
          end_local: newEndISO
        };
        console.log(`[Scheduler] Scheduling after last event on same day: ${candidate.title_short} at ${newStartISO} (after ${latestEventOnDay.summary})`);
        continue;
      }
      
      // If we can't fit after events and it's a long weekend workout, try BEFORE the first event (very early)
      let foundEarlySlot = false;
      if (isWeekend && isLongWorkout && sameDayEvents.length > 0) {
        const firstEventStartParsed = parseTimeFromISO(firstEvent.start_local);
        // Try starting at 5:00 AM or 5:30 AM
        for (const earlyHour of [5, 6]) {
          for (const earlyMin of [0, 30]) {
            if (earlyHour === 6 && earlyMin === 0) continue; // Skip 6:00, prefer 5:30
            const earlyStartMinutes = earlyHour * 60 + earlyMin;
            const earlyEndMinutes = earlyStartMinutes + duration;
            const firstEventStartMinutes = firstEventStartParsed.hour * 60 + firstEventStartParsed.minute;
            
            if (earlyEndMinutes + 30 <= firstEventStartMinutes) {
              // Can fit if we start this early
              const newStartISO = createISOString(candidateDate + 'T00:00:00', earlyHour, earlyMin);
              const earlyEndHour = earlyHour + Math.floor(duration / 60);
              const earlyEndMin = earlyMin + (duration % 60);
              const earlyFinalEndHour = earlyEndHour + Math.floor(earlyEndMin / 60);
              const earlyFinalEndMin = earlyEndMin % 60;
              const newEndISO = createISOString(newStartISO, earlyFinalEndHour, earlyFinalEndMin);
              candidate = {
                ...candidate,
                start_local: newStartISO,
                end_local: newEndISO
              };
              console.log(`[Scheduler] Scheduling long weekend workout very early (${earlyHour}:${String(earlyMin).padStart(2, '0')} AM) to fit before events: ${candidate.title_short} at ${newStartISO}`);
              foundEarlySlot = true;
              break; // Break out of inner loop
            }
          }
          if (foundEarlySlot) break; // Break out of outer loop
        }
      }
      
      if (foundEarlySlot) {
        continue; // Continue to next iteration of while loop to check spacing
      }
      
      // If we still can't fit on this day, move to next day (don't loop)
      if (attempt < 3) {
        // Only try moving to next day on first few attempts
        const nextDayISO = addDaysToISO(candidate.start_local, 1);
        const nextDayParsed = parseTimeFromISO(nextDayISO);
        const isNextWeekend = nextDayParsed.day === 0 || nextDayParsed.day === 6;
        
        // For long weekend workouts, prefer early morning (7 AM or earlier for long rides)
        const preferredHour = (isLongWorkout && isNextWeekend) ? 6 : 7;
        const preferredMinute = (isLongWorkout && isNextWeekend && preferredHour === 6) ? 30 : 0;
        
        const newStartISO = createISOString(nextDayISO, preferredHour, preferredMinute);
        const endHour3 = preferredHour + Math.floor(duration / 60);
        const endMinute3 = preferredMinute + (duration % 60);
        const finalEndHour3 = endHour3 + Math.floor(endMinute3 / 60);
        const finalEndMin3 = endMinute3 % 60;
        const newEndISO = createISOString(newStartISO, finalEndHour3, finalEndMin3);
        
        candidate = {
          ...candidate,
          start_local: newStartISO,
          end_local: newEndISO
        };
        console.log(`[Scheduler] Cannot fit on ${candidateDate}, moving to next day: ${candidate.title_short} at ${newStartISO}`);
        continue; // Continue to check spacing on new day
      } else {
        // After 3 attempts on different days, give up trying new days and just increment attempt counter
        // This will eventually fail after maxAttempts
        attempt++;
        continue;
      }
    } else {
      // No same-day events - try next day or adjust time
      const nextDayISO = addDaysToISO(candidate.start_local, attempt);
      const nextDayParsed = parseTimeFromISO(nextDayISO);
      const isNextWeekend = nextDayParsed.day === 0 || nextDayParsed.day === 6;
      
      // For long weekend workouts, prefer early morning (7 AM)
      const preferredHour = (isLongWorkout && isNextWeekend) ? 7 : 7;
      const preferredMinute = 0;
      
      const newStartISO = createISOString(nextDayISO, preferredHour, preferredMinute);
      const endHour3 = preferredHour + Math.floor(duration / 60);
      const endMinute3 = preferredMinute + (duration % 60);
      const finalEndHour3 = endHour3 + Math.floor(endMinute3 / 60);
      const finalEndMin3 = endMinute3 % 60;
      const newEndISO = createISOString(newStartISO, finalEndHour3, finalEndMin3);
      
      candidate = {
        ...candidate,
        start_local: newStartISO,
        end_local: newEndISO
      };
    }
  }
  
  console.log(`[Scheduler] Could not find available slot for "${workout.title_short}" after ${maxAttempts} attempts`);
  return null; // Failed to find slot
}

