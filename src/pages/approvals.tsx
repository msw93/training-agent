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
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-teal-50">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-4xl font-extrabold mb-2 bg-gradient-to-r from-cyan-600 to-teal-600 bg-clip-text text-transparent">
            Approval Queue
          </h1>
          <p className="text-gray-600">Review and manage proposed training events</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-cyan-100">
          <p className="mb-6 text-gray-700 leading-relaxed">
            These are your current training events. Proposed changes and approvals will appear here.
          </p>
          
          {error && (
            <div className="mb-6 bg-red-50 border-2 border-red-200 text-red-700 px-6 py-4 rounded-xl font-medium">
              ⚠️ {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mb-4"></div>
              <p className="text-gray-600">Loading events...</p>
            </div>
          ) : events.length > 0 ? (
            <div className="space-y-4">
              {events.map((e, idx) => (
                <div 
                  key={e.event_id} 
                  className="p-5 bg-gradient-to-r from-cyan-50 to-teal-50 rounded-xl border-2 border-cyan-200 hover:shadow-lg transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-bold text-lg text-gray-800 mb-2">{e.title_short}</div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <span>🕐</span>
                          <span>{new Date(e.start_local).toLocaleString()}</span>
                        </span>
                        <span>→</span>
                        <span className="flex items-center gap-1">
                          <span>🕐</span>
                          <span>{new Date(e.end_local).toLocaleString()}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">📭</div>
              <p className="text-xl text-gray-600 font-medium">No pending items</p>
              <p className="text-gray-500 mt-2">Generate a plan to see proposals here!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
