import React, { useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';

const EMOJI = [
  '😀', '😁', '😂', '😊', '😉', '😍', '😘', '😎',
  '🤔', '😅', '😢', '😮', '🙌', '👏', '👍', '👎',
  '🙏', '🎉', '🔥', '✨', '❤️', '💯', '✅', '⭐',
  '📎', '📌', '📝', '📅', '⏰', '💡', '🚀', '👀',
];

export function EmojiMenu({ onPick, className = '' }: { onPick: (emoji: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title="Insert emoji"
        className="p-1.5 hover:bg-slate-200 rounded-full transition cursor-pointer text-[#202124] hover:text-black"
      >
        <Smile className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-40 grid grid-cols-8 gap-0.5 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="h-8 w-8 rounded-md text-base hover:bg-slate-100"
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
