import { useEffect, useState } from 'react';
import { listTrainingEvents, llmPlan, llmModify, listProposals, approveProposal, deleteTrainingEvent } from '@/lib/api';
import GitHubDiff from '@/components/GitHubDiff';
import EventDetailsModal from '@/components/EventDetailsModal';
import { TableSkeleton, ProposalSkeleton } from '@/components/LoadingSkeleton';
import { useToast } from '@/contexts/ToastContext';
import { useUndoRedo } from '@/hooks/useUndoRedo';

interface EventItem {
  event_id: string;
  title_short: string;
  start_local: string;
  end_local: string;
  description?: string;
}

export default function PlanWeek() {
  const [proposed, setProposed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('Plan 9 workouts for next week: 3 swims, 3 runs, and 3 rides. Vary the intensity and duration.');
  const [combinedDiff, setCombinedDiff] = useState<string>('');
  const [proposals, setProposals] = useState<Array<{ id: string; diff: string; event?: any; allDayWarnings?: any[] }>>([]);
  const [planErrors, setPlanErrors] = useState<Array<{ title: string; error: string }>>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modifyInstruction, setModifyInstruction] = useState<string>('');
  const [modifyLoading, setModifyLoading] = useState(false);
  const [modifyProposals, setModifyProposals] = useState<Array<{ id: string; diff: string; event?: any }>>([]);
  const [modifyCombinedDiff, setModifyCombinedDiff] = useState<string>('');
  
  const toast = useToast();
  const { addAction, undo, canUndo, lastAction } = useUndoRedo();

  async function refresh() {
    try {
      setEventsLoading(true);
      const data = await listTrainingEvents();
      // Transform Google Calendar events to our format, filtering out invalid ones
      const transformed = (data.events || [])
        .map((e: any) => ({
          event_id: e.id,
          title_short: e.summary || 'Untitled',
          start_local: e.start?.dateTime || e.start?.date,
          end_local: e.end?.dateTime || e.end?.date,
          description: e.description || ''
        }))
        .filter((e: EventItem) => e.event_id && e.start_local && e.end_local); // Only valid events
      setEvents(transformed);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load events');
    } finally {
      setEventsLoading(false);
    }
  }

  const handleApprove = async (proposalId: string, diff: string) => {
    const previousProposals = [...proposals];
    try {
      setLoading(true);
      await approveProposal(proposalId);
      
      // Add to undo history
      addAction({
        type: 'approve',
        timestamp: Date.now(),
        data: { proposalId, diff },
        undo: async () => {
          // Note: This would require a backend endpoint to recreate a proposal
          toast.warning('Undo for approvals requires backend support');
        },
        description: `Approved: ${diff.substring(0, 50)}...`
      });
      
      const lp = await listProposals();
      setProposals(lp.proposals || []);
      await refresh();
      toast.success('Proposal approved successfully!');
    } catch (e: any) {
      setProposals(previousProposals);
      toast.error(e.message || 'Approve failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkApprove = async () => {
    if (proposals.length === 0) return;
    if (!confirm(`Are you sure you want to approve all ${proposals.length} proposals?`)) return;

    const previousProposals = [...proposals];
    let successCount = 0;
    let failCount = 0;

    try {
      setLoading(true);
      for (const proposal of proposals) {
        try {
          await approveProposal(proposal.id);
          successCount++;
        } catch (e) {
          failCount++;
          console.error('Failed to approve proposal:', proposal.id, e);
        }
      }
      
      const lp = await listProposals();
      setProposals(lp.proposals || []);
      await refresh();
      
      if (failCount === 0) {
        toast.success(`All ${successCount} proposals approved!`);
      } else {
        toast.warning(`Approved ${successCount}, failed ${failCount}`);
      }
    } catch (e: any) {
      setProposals(previousProposals);
      toast.error('Bulk approve failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (proposalId: string) => {
    setLoading(true);
    try {
      await rejectProposal(proposalId);
      setProposals(prev => prev.filter(p => p.id !== proposalId));
      toast.info('Proposal rejected');
    } catch (e: any) {
      toast.error(e.message || 'Reject failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkReject = () => {
    if (proposals.length === 0) return;
    if (!confirm(`Are you sure you want to reject all ${proposals.length} proposals?`)) return;

    setProposals([]);
    toast.info(`Rejected ${proposals.length} proposals`);
  };

  const handleDeleteEvent = async (event_id: string) => {
    const eventToDelete = events.find(e => e.event_id === event_id);
    if (!eventToDelete) return;

    try {
      await deleteTrainingEvent(event_id);
      await refresh();
      toast.success(`Deleted "${eventToDelete.title_short}"`);
      
      // Add to undo history
      addAction({
        type: 'delete',
        timestamp: Date.now(),
        data: eventToDelete,
        undo: async () => {
          toast.warning('Undo for deletions requires backend support');
        },
        description: `Deleted: ${eventToDelete.title_short}`
      });
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
      throw e;
    }
  };

  const handleUndo = async () => {
    try {
      await undo();
      toast.success('Action undone');
    } catch (e: any) {
      toast.error('Undo failed');
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent tracking-tight">
            Plan Next Week
          </h1>
          <p className="text-lg text-gray-600 font-medium">Generate your training plan with AI assistance</p>
        </div>

        {canUndo && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between animate-slideInDown">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-amber-900">{lastAction?.description}</span>
            </div>
            <button
              onClick={handleUndo}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Undo
            </button>
          </div>
        )}

        <form
          className="mb-10 bg-white/90 backdrop-blur-md rounded-2xl shadow-lg border border-gray-200/50 p-8 hover:shadow-xl transition-shadow duration-300"
          onSubmit={async e => {
            e.preventDefault();
            setError(null);
            setLoading(true);
            try {
              const res = await llmPlan(prompt);
              setCombinedDiff(res.combinedDiff || '');
              setProposals(res.proposals || []);
              setPlanErrors([]); // No errors shown to UI
              setProposed(true);
              
              const count = res.proposals?.length || 0;
              const skipped = res.skippedCount || 0;
              const requested = res.requestedCount;
              const actual = res.actualCount;
              
              // Show warning if count mismatch
              if (res.countWarning) {
                toast.warning(res.countWarning);
              } else if (skipped > 0) {
                toast.success(`Generated ${count} proposals (${skipped} workouts couldn't be scheduled)`);
              } else if (requested && actual === requested) {
                toast.success(`Generated exactly ${count} proposals as requested!`);
              } else {
                toast.success(`Generated ${count} proposals!`);
              }
            } catch (e: any) {
              toast.error(e.message || 'Failed to create');
            } finally {
              setLoading(false);
            }
          }}
        >
          <label className="block mb-4">
            <span className="block text-sm font-semibold text-gray-700 mb-2">Planning Prompt</span>
            <textarea 
              className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg text-gray-900 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all placeholder:text-gray-400 resize-y min-h-[120px]" 
              rows={5}
              value={prompt} 
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g., Plan 9 workouts for next week: 3 swims, 3 runs, and 3 rides."
            />
          </label>
          <button 
            type="submit" 
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none" 
            disabled={loading}
          >
            {loading ? '✨ Generating Plan...' : '🚀 Generate Plan (LLM)'}
          </button>
        </form>

        {/* Modify Existing Events Section */}
        <div className="mt-8 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-lg p-6 border-2 border-blue-200">
          <h2 className="text-2xl font-bold mb-4 text-gray-800 flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Modify Existing Plan
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Use natural language to modify your existing workouts. Examples: "Move Monday's swim to Tuesday morning", "Cancel Friday's workout", "Reschedule all workouts 1 hour earlier"
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!modifyInstruction.trim()) return;
              try {
                setError(null);
                setModifyLoading(true);
                const response = await llmModify(modifyInstruction);
                setModifyProposals(response.proposals || []);
                setModifyCombinedDiff(response.combinedDiff || '');
                toast.success(`Generated ${response.proposals?.length || 0} modification proposals!`);
                if (response.errors && response.errors.length > 0) {
                  toast.warning(`${response.errors.length} modifications failed`);
                }
                // Refresh events to show updated state
                await refresh();
              } catch (e: any) {
                setError(e.message || 'Failed to modify');
                toast.error(e.message || 'Failed to modify');
              } finally {
                setModifyLoading(false);
              }
            }}
          >
            <label className="block mb-4">
              <span className="block text-sm font-semibold text-gray-700 mb-2">Modification Instruction</span>
              <textarea 
                className="w-full border-2 border-blue-300 rounded-xl px-4 py-3 text-lg text-gray-900 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all placeholder:text-gray-400 resize-y min-h-[100px]" 
                rows={4}
                value={modifyInstruction} 
                onChange={e => setModifyInstruction(e.target.value)}
                placeholder="e.g., Move Monday's swim to Tuesday morning"
              />
            </label>
            <button 
              type="submit" 
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none" 
              disabled={modifyLoading || events.length === 0}
            >
              {modifyLoading ? '🔄 Processing Modification...' : '✏️ Modify Plan (LLM)'}
            </button>
          </form>

          {modifyProposals.length > 0 && (
            <div className="mt-6 bg-white/90 backdrop-blur-sm rounded-xl p-5 border-2 border-blue-200">
              <h3 className="text-lg font-semibold mb-3 text-gray-800">Modification Proposals</h3>
              {modifyCombinedDiff && (
                <div className="mb-4">
                  <GitHubDiff diff={modifyCombinedDiff} />
                </div>
              )}
              <div className="space-y-2">
                {modifyProposals.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-700 font-medium">{p.diff}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          try {
                            await approveProposal(p.id);
                            toast.success('Modification approved!');
                            setModifyProposals(modifyProposals.filter(prop => prop.id !== p.id));
                            await refresh();
                          } catch (e: any) {
                            toast.error(e.message || 'Failed to approve');
                          }
                        }}
                        className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-sm font-semibold hover:bg-emerald-600 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            const lp = await listProposals();
                            setModifyProposals(modifyProposals.filter(prop => prop.id !== p.id));
                            toast.info('Modification rejected');
                          } catch (e: any) {
                            toast.error(e.message || 'Failed to reject');
                          }
                        }}
                        className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-300 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border-2 border-red-200 text-red-700 px-6 py-4 rounded-xl font-medium">
            ⚠️ {error}
          </div>
        )}

        {proposed && (
          <div className="space-y-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-indigo-100">
              <h2 className="text-2xl font-bold mb-4 text-gray-800">📋 Proposed Plan</h2>
              
              {combinedDiff && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Combined Diff
                  </h3>
                  <GitHubDiff diff={combinedDiff} />
                </div>
              )}

              {proposals.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Proposals to Approve ({proposals.length})
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={handleBulkReject}
                        disabled={loading}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Reject All
                      </button>
                      <button
                        onClick={handleBulkApprove}
                        disabled={loading}
                        className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:shadow-md text-white rounded-lg font-medium transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Approve All
                      </button>
                    </div>
                  </div>
                  {loading ? (
                    <ProposalSkeleton count={Math.min(proposals.length, 3)} />
                  ) : (
                    <div className="space-y-3">
                      {proposals
                        .filter(p => p.event && p.event.start_local && p.event.end_local)
                        .map(p => {
                          const event = p.event!;
                          const startDate = new Date(event.start_local);
                          const endDate = new Date(event.end_local);
                          
                          return (
                            <div key={p.id} className="group flex items-start gap-4 p-5 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 hover:shadow-md transition-all duration-200">
                              <div className="flex-1 min-w-0 space-y-3">
                                <div className="flex items-start justify-between">
                                  <h4 className="text-lg font-bold text-gray-900">{event.title_short || 'Workout'}</h4>
                                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-medium">
                                    Proposal
                                  </span>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <span className="font-semibold text-gray-700">Start:</span>
                                    <div className="text-gray-600">
                                      {startDate ? startDate.toLocaleString() : 'N/A'}
                                    </div>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-gray-700">End:</span>
                                    <div className="text-gray-600">
                                      {endDate ? endDate.toLocaleString() : 'N/A'}
                                    </div>
                                  </div>
                                </div>
                                
                              {event.description && (
                                <div className="mt-3">
                                  <span className="font-semibold text-gray-700 text-sm">Details:</span>
                                  <pre className="mt-1 text-sm text-gray-600 whitespace-pre-wrap font-sans bg-gray-50 p-3 rounded-lg border border-gray-200">
                                    {event.description}
                                  </pre>
                                </div>
                              )}
                              
                              {p.allDayWarnings && p.allDayWarnings.length > 0 && (
                                <div className="mt-3 p-3 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                                  <div className="flex items-start gap-2">
                                    <span className="text-yellow-600 text-lg">⚠️</span>
                                    <div className="flex-1">
                                      <span className="font-semibold text-yellow-800 text-sm">All-Day Event Notice:</span>
                                      <div className="mt-1 space-y-1">
                                        {p.allDayWarnings.map((w: any, idx: number) => (
                                          <div key={idx} className="text-xs text-yellow-700">
                                            • {w.summary} ({w.start?.date || 'N/A'})
                                          </div>
                                        ))}
                                      </div>
                                      <p className="text-xs text-yellow-600 mt-2 italic">
                                        This workout overlaps with an all-day event but may still be scheduled.
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                              
                              <div className="shrink-0 flex flex-col gap-2">
                                <button
                                  className="bg-gradient-to-r from-emerald-500 to-green-600 text-white px-5 py-2.5 rounded-lg font-semibold shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleApprove(p.id, p.diff)}
                                  disabled={loading}
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Approve
                                </button>
                                <button
                                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-lg font-semibold shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleReject(p.id)}
                                  disabled={loading}
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                  Reject
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {proposals.length === 0 && planErrors.length === 0 && (
                <p className="text-gray-500 italic">All proposals have been approved! 🎉</p>
              )}

              {planErrors.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-3 text-red-700">⚠️ Failed Items ({planErrors.length})</h3>
                  <div className="space-y-2">
                    {planErrors.map((err, idx) => (
                      <div key={idx} className="p-3 bg-red-50 border-2 border-red-200 rounded-lg">
                        <div className="font-semibold text-red-800">{err.title}</div>
                        <div className="text-sm text-red-600 mt-1">{err.error}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-indigo-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800">📅 Current Training Calendar</h2>
                <button
                  className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={async () => {
                    if (!confirm('Are you sure you want to delete all events in the next week?')) return;
                    try {
                      setLoading(true);
                      setError(null);
                      const now = new Date();
                      const nextMonday = new Date(now);
                      nextMonday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
                      nextMonday.setHours(0, 0, 0, 0);
                      const nextSunday = new Date(nextMonday);
                      nextSunday.setDate(nextMonday.getDate() + 7);
                      nextSunday.setHours(23, 59, 59, 999);
                      const weekEvents = events.filter(e => {
                        const eventStart = new Date(e.start_local);
                        return eventStart >= nextMonday && eventStart < nextSunday;
                      });
                      for (const e of weekEvents) {
                        try {
                          await deleteTrainingEvent(e.event_id);
                        } catch (err: any) {
                          console.warn('Failed to delete event', e.event_id, err);
                        }
                      }
                      await refresh();
                    } catch (e: any) {
                      setError(e.message || 'Delete failed');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading || eventsLoading || events.length === 0}
                >
                  🗑️ Reset Next Week
                </button>
              </div>
              {eventsLoading ? (
                <TableSkeleton rows={5} />
              ) : events.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gradient-to-r from-indigo-100 to-purple-100">
                        <th className="px-4 py-3 font-semibold text-gray-700">Title</th>
                        <th className="px-4 py-3 font-semibold text-gray-700">Start</th>
                        <th className="px-4 py-3 font-semibold text-gray-700">End</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((e, idx) => {
                        const startDate = e.start_local ? new Date(e.start_local) : null;
                        const endDate = e.end_local ? new Date(e.end_local) : null;
                        const isValidStart = startDate && !isNaN(startDate.getTime());
                        const isValidEnd = endDate && !isNaN(endDate.getTime());
                        return (
                          <tr 
                            key={e.event_id} 
                            className={`border-b ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50 cursor-pointer transition-colors`}
                            onClick={() => {
                              setSelectedEvent(e);
                              setIsModalOpen(true);
                            }}
                          >
                            <td className="px-4 py-3 font-medium text-gray-800">{e.title_short}</td>
                            <td className="px-4 py-3 text-gray-600">
                              {isValidStart ? startDate.toLocaleString() : 'Invalid date'}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {isValidEnd ? endDate.toLocaleString() : 'Invalid date'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">📭</div>
                  <p>No events scheduled yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {!proposed && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-indigo-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-800">📅 Current Training Calendar</h2>
              <button
                className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-lg font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={async () => {
                  if (!confirm('Are you sure you want to delete all events in the next week?')) return;
                  try {
                    setLoading(true);
                    setError(null);
                    const now = new Date();
                    const nextMonday = new Date(now);
                    nextMonday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
                    nextMonday.setHours(0, 0, 0, 0);
                    const nextSunday = new Date(nextMonday);
                    nextSunday.setDate(nextMonday.getDate() + 7);
                    nextSunday.setHours(23, 59, 59, 999);
                    const weekEvents = events.filter(e => {
                      const eventStart = new Date(e.start_local);
                      return eventStart >= nextMonday && eventStart < nextSunday;
                    });
                    for (const e of weekEvents) {
                      try {
                        await deleteTrainingEvent(e.event_id);
                      } catch (err: any) {
                        console.warn('Failed to delete event', e.event_id, err);
                      }
                    }
                    await refresh();
                  } catch (e: any) {
                    setError(e.message || 'Delete failed');
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading || eventsLoading || events.length === 0}
              >
                🗑️ Reset Next Week
              </button>
            </div>
            {eventsLoading ? (
              <TableSkeleton rows={5} />
            ) : events.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gradient-to-r from-indigo-100 to-purple-100">
                      <th className="px-4 py-3 font-semibold text-gray-700">Title</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Start</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e, idx) => (
                      <tr 
                        key={e.event_id} 
                        className={`border-b ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50 cursor-pointer transition-colors`}
                        onClick={() => {
                          setSelectedEvent(e);
                          setIsModalOpen(true);
                        }}
                      >
                        <td className="px-4 py-3 font-medium text-gray-800">{e.title_short}</td>
                        <td className="px-4 py-3 text-gray-600">{new Date(e.start_local).toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-600">{new Date(e.end_local).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">📭</div>
                <p>No events scheduled yet.</p>
              </div>
            )}
          </div>
        )}

        {/* Event Details Modal */}
        {selectedEvent && (
          <EventDetailsModal
            event={selectedEvent}
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              setSelectedEvent(null);
            }}
            onDelete={handleDeleteEvent}
          />
        )}
      </div>
    </div>
  );
}
