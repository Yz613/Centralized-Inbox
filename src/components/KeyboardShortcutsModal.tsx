import React, { useEffect } from 'react';
import { X, Keyboard, Command } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutSection {
  title: string;
  items: ShortcutItem[];
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sections: ShortcutSection[] = [
    {
      title: 'Navigation',
      items: [
        { keys: ['j', '↓'], description: 'Next email in list' },
        { keys: ['k', '↑'], description: 'Previous email in list' },
        { keys: ['Enter', 'o'], description: 'Open selected email' },
        { keys: ['Esc'], description: 'Back to inbox / Close modal' },
      ],
    },
    {
      title: 'Actions & Triage',
      items: [
        { keys: ['e'], description: 'Archive email' },
        { keys: ['s'], description: 'Star / Unstar' },
        { keys: ['u'], description: 'Mark as unread' },
        { keys: ['h'], description: 'Snooze email' },
        { keys: ['#'], description: 'Delete conversation' },
        { keys: ['x'], description: 'Select / Deselect conversation' },
      ],
    },
    {
      title: 'Compose & Reply',
      items: [
        { keys: ['c', 'n'], description: 'New message' },
        { keys: ['r'], description: 'Reply to open email' },
        { keys: ['f'], description: 'Forward open email' },
      ],
    },
    {
      title: 'Global & Search',
      items: [
        { keys: ['/'], description: 'Search emails' },
        { keys: ['⌘', 'K'], description: 'Command palette' },
        { keys: ['?'], description: 'Keyboard shortcuts help' },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/75">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Keyboard Shortcuts</h2>
              <p className="text-xs text-slate-500 font-medium">Power-user speed controls</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts Grid */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto">
          {sections.map((sec) => (
            <div key={sec.title} className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {sec.title}
              </h3>
              <div className="space-y-1.5">
                {sec.items.map((item) => (
                  <div
                    key={item.description}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50 transition text-xs"
                  >
                    <span className="text-slate-700 font-medium">{item.description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, i) => (
                        <React.Fragment key={k}>
                          <kbd className="min-w-[22px] h-6 px-1.5 flex items-center justify-center rounded-md bg-slate-100 border border-slate-300 text-slate-800 font-mono text-[11px] font-semibold shadow-2xs">
                            {k}
                          </kbd>
                          {i < item.keys.length - 1 && (
                            <span className="text-[10px] text-slate-400 font-medium">or</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>
            Press <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono text-[10px]">Esc</kbd> to dismiss anytime
          </span>
          <span className="font-semibold text-slate-700">ProjectInbox Speed Navigation</span>
        </div>
      </div>
    </div>
  );
};
