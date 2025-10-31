// Event spacing validation - ensures gaps between workouts

interface Event {
  start_local: string;
  end_local: string;
  summary?: string;
}

export const MIN_GAP_MINUTES = 30; // Minimum gap between events (except bricks)

// Check if two events have the required gap (or are a valid brick)
function hasValidGap(event1: Event, event2: Event): boolean {
  const end1 = new Date(event1.end_local);
  const start2 = new Date(event2.start_local);
  
  // Allow zero gap for brick workouts (bike → run)
  const isBrick = isBrickWorkout(event1, event2);
  if (isBrick) {
    return true; // Bricks can be back-to-back
  }
  
  // All other combinations require a gap
  const gapMs = start2.getTime() - end1.getTime();
  const gapMinutes = gapMs / (1000 * 60);
  
  return gapMinutes >= MIN_GAP_MINUTES;
}

// Check if this is a brick workout (bike immediately followed by run)
function isBrickWorkout(event1: Event, event2: Event): boolean {
  const title1 = (event1.summary || '').toLowerCase();
  const title2 = (event2.summary || '').toLowerCase();
  
  const isBike = title1.includes('bike') || title1.includes('ride') || title1.includes('cycling');
  const isRun = title2.includes('run') || title2.includes('running');
  
  // Brick: Bike followed by Run (can be back-to-back)
  return isBike && isRun;
}

// Check if event overlaps with any existing events (with gap requirements)
export function checkEventSpacing(
  newEvent: Event,
  existingEvents: Event[]
): { valid: boolean; conflicts: Event[]; warnings: string[] } {
  const conflicts: Event[] = [];
  const warnings: string[] = [];
  
  for (const existing of existingEvents) {
    // Check for actual overlap
    const newStart = new Date(newEvent.start_local);
    const newEnd = new Date(newEvent.end_local);
    const existingStart = new Date(existing.start_local);
    const existingEnd = new Date(existing.end_local);
    
    // Check if events overlap
    const overlaps = newStart < existingEnd && newEnd > existingStart;
    if (overlaps) {
      conflicts.push(existing);
      warnings.push(`Overlaps with "${existing.summary}" (${existingStart.toLocaleString()} → ${existingEnd.toLocaleString()})`);
      continue;
    }
    
    // Check gap requirements (only if not overlapping)
    // Check if new event is too close after existing
    const gapAfter = (newStart.getTime() - existingEnd.getTime()) / (1000 * 60);
    if (gapAfter >= 0 && gapAfter < MIN_GAP_MINUTES && !isBrickWorkout(existing, newEvent)) {
      conflicts.push(existing);
      warnings.push(`Too close after "${existing.summary}" (gap: ${Math.round(gapAfter)} min, need ${MIN_GAP_MINUTES} min)`);
    }
    
    // Check if new event is too close before existing
    const gapBefore = (existingStart.getTime() - newEnd.getTime()) / (1000 * 60);
    if (gapBefore >= 0 && gapBefore < MIN_GAP_MINUTES && !isBrickWorkout(newEvent, existing)) {
      conflicts.push(existing);
      warnings.push(`Too close before "${existing.summary}" (gap: ${Math.round(gapBefore)} min, need ${MIN_GAP_MINUTES} min)`);
    }
  }
  
  return {
    valid: conflicts.length === 0,
    conflicts,
    warnings
  };
}

