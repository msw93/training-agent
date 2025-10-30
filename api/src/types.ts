// Workout event spec types (matches MVP spec)

export type Sport = 'bike' | 'run' | 'swim';

export interface EventTargets {
  power?: string | null;
  pace?: string | null;
  hr?: string | null;
}

export interface Interval {
  work_min: number;
  intensity: string;
  reps: number;
  rest_min: number;
}

export interface EventCalc {
  tss: number;
  kcal: number;
}

export interface WorkoutEvent {
  sport: Sport;
  title_short: string;
  duration_min: number;
  targets: EventTargets;
  intervals: Interval[];
  notes: string;
  calc: EventCalc;
}

// API request body types
export interface CreateTrainingEventRequest {
  title_short: string;
  start_local: string; // ISO 8601
  end_local: string; // ISO 8601
  description: string;
  workout?: WorkoutEvent;
}

export interface UpdateTrainingEventRequest {
  event_id: string;
  // Partial update fields...
}

export interface DeleteTrainingEventRequest {
  event_id: string;
}
