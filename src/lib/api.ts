const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4100/api';

export interface CreateTrainingEventBody {
  title_short: string;
  start_local: string;
  end_local: string;
  description: string;
  workout?: unknown;
}

export async function createTrainingEvent(body: CreateTrainingEventBody) {
  const res = await fetch(`${API_BASE}/calendar/create_training_event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Create failed: ${res.status}`);
  return res.json();
}

export async function listTrainingEvents() {
  const res = await fetch(`${API_BASE}/calendar/list_training_events`);
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  return res.json();
}
