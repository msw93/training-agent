import { useState } from 'react';

interface EventDetailsModalProps {
  event: {
    event_id: string;
    title_short: string;
    start_local: string;
    end_local: string;
    description?: string;
  };
  isOpen: boolean;
  onClose: () => void;
  onDelete: (event_id: string) => Promise<void>;
}

export default function EventDetailsModal({ event, isOpen, onClose, onDelete }: EventDetailsModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${event.title_short}"?`)) return;
    
    setIsDeleting(true);
    try {
      await onDelete(event.event_id);
      onClose();
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const startDate = new Date(event.start_local);
  const endDate = new Date(event.end_local);
  const duration = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60)); // minutes

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-slideInDown"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 rounded-t-2xl">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-1">{event.title_short}</h2>
              <p className="text-indigo-100 text-sm">Event Details</p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 hover:bg-white/20 rounded-lg p-2 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Time & Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Start Time</label>
              <p className="text-lg font-medium text-gray-900">{startDate.toLocaleString()}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">End Time</label>
              <p className="text-lg font-medium text-gray-900">{endDate.toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold text-indigo-900">Duration:</span>
              <span className="text-indigo-700">{duration} minutes</span>
            </div>
          </div>

          {/* Description */}
          {event.description && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Description</label>
              <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm font-mono whitespace-pre-wrap text-gray-800 leading-relaxed">
{event.description}
              </pre>
            </div>
          )}

          {/* Event ID */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Event ID</label>
            <p className="text-xs font-mono text-gray-600 bg-gray-50 px-3 py-2 rounded border border-gray-200">{event.event_id}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 rounded-b-2xl border-t border-gray-200 flex items-center justify-between gap-4">
          <button
            onClick={onClose}
            className="flex-1 bg-white border-2 border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Deleting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Event
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

