import { useEffect, useState } from 'react';
import { listTrainingEvents } from '@/lib/api';

export default function Approvals() {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await listTrainingEvents();
        setEvents(data.events || []);
      } catch (e: any) {
        setError(e.message || 'Failed to load approvals');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-2xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-4">Approval Queue</h1>
      <div className="bg-white shadow p-6 rounded text-gray-700">
        <p className="mb-4">These are proposed or current training events (mocked). Final diffs/approvals will be shown here.</p>
        {error && <div className="text-red-600 mb-2">{error}</div>}
        {loading ? (
          <p>Loading…</p>
        ) : (
          <ul className="space-y-2">
            {events.map(e => (
              <li key={e.event_id} className="border p-3 rounded">
                <div className="font-medium">{e.title_short}</div>
                <div className="text-sm text-gray-600">{new Date(e.start_local).toLocaleString()} → {new Date(e.end_local).toLocaleString()}</div>
              </li>
            ))}
            {events.length === 0 && <li className="text-gray-500">No pending items.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
