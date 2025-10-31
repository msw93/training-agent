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

export async function llmPlan(prompt: string) {
  const res = await fetch(`${API_BASE}/llm/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt })
  });
  if (!res.ok) throw new Error(`LLM plan failed: ${res.status}`);
  return res.json();
}

export async function listProposals() {
  const res = await fetch(`${API_BASE}/approvals/list`);
  if (!res.ok) throw new Error(`List proposals failed: ${res.status}`);
  return res.json();
}

export async function approveProposal(proposal_id: string) {
  const res = await fetch(`${API_BASE}/approvals/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposal_id })
  });
  if (!res.ok) throw new Error(`Approve failed: ${res.status}`);
  return res.json();
}

export async function deleteTrainingEvent(event_id: string) {
  const res = await fetch(`${API_BASE}/calendar/delete_training_event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id })
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  return res.json();
}

export async function llmModify(instruction: string) {
  const res = await fetch(`${API_BASE}/llm/modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction })
  });
  if (!res.ok) throw new Error(`LLM modify failed: ${res.status}`);
  return res.json();
}
