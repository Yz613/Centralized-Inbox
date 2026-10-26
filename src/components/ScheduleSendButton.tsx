import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Clock, Send } from 'lucide-react';
import { formatScheduleLabel, schedulePresets } from '../utils/scheduledMail';

function localInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ScheduleSendButton({
  disabled,
  sending,
  label,
  onSend,
  onSchedule,
}: {
  disabled: boolean;
  sending: boolean;
  label: string;
  onSend: () => void;
  onSchedule: (when: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const presets = schedulePresets(new Date());
  const earliest = new Date(Date.now() + 2 * 60 * 1000);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex items-stretch">
      <button
        type="button"
        onClick={onSend}
        disabled={disabled || sending}
        className={`inline-flex items-center gap-1.5 pl-5 pr-3 py-2 rounded-l-full font-semibold text-xs shadow-2xs transition active:scale-95 cursor-pointer ${
          disabled
            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
            : 'bg-[#0b57d0] hover:bg-[#0842a0] text-white'
        }`}
        title="Send (⌘+Enter)"
      >
        <Send className="w-3.5 h-3.5" />
        <span>{sending ? 'Sending…' : label}</span>
        <span className="text-[10px] opacity-75 font-mono hidden sm:inline ml-0.5">⌘↵</span>
      </button>
      <button
        type="button"
        disabled={disabled || sending}
        onClick={() => {
          setCustom(localInputValue(earliest));
          setOpen((value) => !value);
        }}
        aria-label="Schedule send"
        title="Schedule send"
        className={`px-2 rounded-r-full border-l border-white/30 transition cursor-pointer ${
          disabled
            ? 'bg-slate-200 text-slate-400 cursor-not-allowed border-slate-300'
            : 'bg-[#0b57d0] hover:bg-[#0842a0] text-white'
        }`}
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && !disabled && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-72 rounded-xl border border-slate-200 bg-white text-[#1f1f1f] shadow-xl overflow-hidden">
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Schedule send
          </div>
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-[#e8f0fe] flex items-center justify-between gap-3 text-xs"
              onClick={() => {
                setOpen(false);
                onSchedule(preset.at);
              }}
            >
              <span className="font-semibold">{preset.label}</span>
              <span className="text-slate-500">{preset.detail}</span>
            </button>
          ))}
          <form
            className="border-t border-slate-100 p-3 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              const when = new Date(custom);
              if (!Number.isFinite(when.getTime())) return;
              setOpen(false);
              onSchedule(when);
            }}
          >
            <label className="block text-[11px] font-bold text-slate-500" htmlFor="schedule-custom">
              Pick date and time
            </label>
            <input
              id="schedule-custom"
              type="datetime-local"
              required
              min={localInputValue(earliest)}
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            />
            <button
              type="submit"
              className="w-full rounded-full bg-[#0b57d0] text-white text-xs font-semibold py-1.5 hover:bg-[#0842a0]"
            >
              {Number.isFinite(new Date(custom).getTime()) ? `Schedule for ${formatScheduleLabel(new Date(custom))}` : 'Schedule'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
