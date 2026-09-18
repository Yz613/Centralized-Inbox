import React, { useState, useEffect } from 'react';
import { useInbox } from '../context/InboxContext';
import { X, Sparkles, RefreshCw, CheckSquare, AlertTriangle, Inbox, Check } from 'lucide-react';

interface ProjectSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProjectSummaryModal: React.FC<ProjectSummaryModalProps> = ({ isOpen, onClose }) => {
  const { activeProject, projectInboxes, filteredThreads } = useInbox();
  const [summaryData, setSummaryData] = useState<{
    overview?: string;
    keyPoints?: string[];
    actionItems?: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/project-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: activeProject?.name || 'All Inboxes',
          inboxes: projectInboxes.map((i) => ({
            name: i.name,
            email: i.email,
            role: i.role,
            channel: i.channel,
          })),
          threads: filteredThreads.slice(0, 15).map((t) => ({
            subject: t.subject,
            role: t.inboxRole,
            channel: t.channel,
            snippet: t.snippet,
            isRead: t.isRead,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSummaryData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !summaryData && !loading) {
      fetchSummary();
    }
  }, [isOpen, activeProject?.id]);

  if (!isOpen) return null;

  const toggleCheck = (idx: number) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-50/70 to-purple-50/70 dark:from-indigo-950/40 dark:to-purple-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-sans">
                AI Cross-Inbox Briefing
              </h3>
              <p className="text-[11px] text-slate-400">
                Synthesis for {activeProject?.name || 'All Connected Inboxes'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs flex-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
              <p className="font-semibold text-slate-700 dark:text-slate-300">
                Analyzing recent emails across {projectInboxes.length} project inboxes...
              </p>
              <p className="text-[11px] text-slate-400">
                Extracting open action items, customer requests, and administrative notifications.
              </p>
            </div>
          ) : summaryData ? (
            <>
              {/* Executive Overview */}
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-1 text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Executive Briefing
                </h4>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  {summaryData.overview}
                </p>
              </div>

              {/* Key Insights */}
              {summaryData.keyPoints && summaryData.keyPoints.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Channel & Box Insights
                  </h4>
                  <ul className="space-y-1.5 pl-1">
                    {summaryData.keyPoints.map((pt, i) => (
                      <li
                        key={i}
                        className="p-2 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 flex items-start gap-2"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Items Checklist */}
              {summaryData.actionItems && summaryData.actionItems.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
                    Action Items Checklist
                  </h4>
                  <div className="space-y-1.5">
                    {summaryData.actionItems.map((act, idx) => {
                      const isDone = !!checkedItems[idx];
                      return (
                        <div
                          key={idx}
                          onClick={() => toggleCheck(idx)}
                          className={`p-2 rounded cursor-pointer border transition flex items-center gap-2.5 ${
                            isDone
                              ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/50 text-slate-400 line-through'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              isDone
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {isDone && <Check className="w-3 h-3" />}
                          </div>
                          <span>{act}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-slate-500">
              No analysis available. Click regenerate to synthesize.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40 text-xs">
          <button
            type="button"
            onClick={fetchSummary}
            disabled={loading}
            className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Regenerate Analysis</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
