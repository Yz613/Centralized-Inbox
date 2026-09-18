import React from 'react';
import { useInbox } from '../context/InboxContext';

export const UndoToast: React.FC = () => {
  const { undoToast, undoLastAction } = useInbox();
  if (!undoToast) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] px-4 py-2.5 rounded-2xl bg-slate-900 text-white shadow-2xl border border-slate-700 flex items-center gap-3 text-xs">
      <span>{undoToast.label}</span>
      <button
        type="button"
        onClick={undoLastAction}
        className="px-2.5 py-1 rounded-lg bg-white text-slate-900 font-bold hover:bg-slate-100"
      >
        Undo
      </button>
    </div>
  );
};
