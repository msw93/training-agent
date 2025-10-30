import { useEffect, useState } from 'react';
import { createTrainingEvent, listTrainingEvents } from '@/lib/api';

interface EventItem {
  event_id: string;
  title_short: string;
  start_local: string;
  end_local: string;
}

export default function PlanWeek() {
  const [proposed, setProposed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      const data = await listTrainingEvents();
      setEvents(data.events || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="max-w-2xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-4">Plan Next Week</h1>
      <form
        className="mb-6 bg-gray-100 p-4 rounded"
        onSubmit={async e => {
          e.preventDefault();
          setError(null);
          setLoading(true);
          try {
            const now = new Date();
            const start = new Date(now.getTime() + 60 * 60 * 1000); // +1h
            const end = new Date(start.getTime() + 75 * 60 * 1000); // +75m
            await createTrainingEvent({
              title_short: 'Bike — VO2',
              start_local: start.toISOString(),
              end_local: end.toISOString(),
              description: 'Duration: 75m; Targets: 5x3\' @120% FTP / 3\' easy; Notes: Vegan fueling: dates; TSS: 90; kcal: 850'
            });
            setProposed(true);
            await refresh();
          } catch (e: any) {
            setError(e.message || 'Failed to create');
          } finally {
            setLoading(false);
          }
        }}
      >
        <label className="block mb-2 font-medium">
          Focus sport:
          <select className="ml-2 border rounded p-1">
            <option>bike</option>
            <option>run</option>
            <option>swim</option>
            <option>balanced</option>
          </select>
        </label>
        <label className="block mb-2 font-medium">
          Notes/preferences:
          <input className="ml-2 border rounded p-1 w-60" type="text" placeholder="e.g. long ride Sat" />
        </label>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded mt-2" disabled={loading}>
          {loading ? 'Working…' : 'Propose Week Plan (mock)'}
        </button>
      </form>
      {error && (
        <div className="text-red-600 mb-4">{error}</div>
      )}
      {proposed && (
        <div className="bg-white shadow p-4 rounded">
          <h2 className="font-semibold mb-2">Proposed/Current Plan</h2>
          {loading ? (
            <p>Loading…</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Title</th>
                  <th className="py-2">Start</th>
                  <th className="py-2">End</th>
                </tr>
              </thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.event_id} className="border-b">
                    <td className="py-2">{e.title_short}</td>
                    <td className="py-2">{new Date(e.start_local).toLocaleString()}</td>
                    <td className="py-2">{new Date(e.end_local).toLocaleString()}</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-3 text-gray-500">No events yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
