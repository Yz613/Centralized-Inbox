import type { Contact } from '../utils/contacts';
import type { MentionAnchor } from './RichTextEditor';

export function sameMention(current: MentionAnchor | null, next: MentionAnchor | null): boolean {
  if (!current || !next) return current === next;
  return current.query === next.query
    && Math.abs(current.top - next.top) < 2
    && Math.abs(current.left - next.left) < 2;
}

export function MentionMenu({
  query,
  contacts,
  activeIndex,
  top,
  left,
  onChoose,
}: {
  query: string;
  contacts: Contact[];
  activeIndex: number;
  top: number;
  left: number;
  onChoose: (contact: Contact) => void;
}) {
  return (
    <div
      className="fixed z-50 w-72 max-w-[calc(100vw-16px)] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
      style={{ top, left }}
    >
      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100">
        {query.trim() ? `People matching “${query.trim()}”` : 'Mention someone'}
      </div>
      {contacts.length === 0 ? (
        <p className="px-3 py-2 text-xs text-slate-500">No matching people</p>
      ) : (
        contacts.map((contact, index) => (
          <button
            key={contact.address}
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              onChoose(contact);
            }}
            className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-3 ${
              index === activeIndex ? 'bg-[#e8f0fe]' : 'hover:bg-slate-50'
            }`}
          >
            <span className="font-semibold text-[#1f1f1f] truncate">{contact.name || contact.address}</span>
            <span className="text-slate-500 truncate">{contact.address}</span>
          </button>
        ))
      )}
    </div>
  );
}
