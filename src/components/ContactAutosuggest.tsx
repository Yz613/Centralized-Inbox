import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Contact, searchContacts, getAvatarColor, parseAddress } from '../utils/contacts';
import { Mail, ArrowDownRight, Sparkles } from 'lucide-react';

interface ContactAutosuggestProps {
  value: string;
  onChange: (value: string) => void;
  onSelectContact?: (contact: Contact) => void;
  contacts: Contact[];
  currentProjectId?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  mode?: 'single' | 'multiple';
  excludeAddresses?: string[];
  disabled?: boolean;
}

/**
 * Highlights matches of query within text.
 */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query || !query.trim()) {
    return <span>{text}</span>;
  }
  const q = query.trim().toLowerCase();
  const index = text.toLowerCase().indexOf(q);
  if (index === -1) {
    return <span>{text}</span>;
  }

  const before = text.slice(0, index);
  const match = text.slice(index, index + q.length);
  const after = text.slice(index + q.length);

  return (
    <span>
      {before}
      <strong className="underline decoration-blue-500 font-extrabold text-blue-700 dark:text-blue-400">
        {match}
      </strong>
      {after}
    </span>
  );
}

export const ContactAutosuggest: React.FC<ContactAutosuggestProps> = ({
  value,
  onChange,
  onSelectContact,
  contacts,
  currentProjectId,
  placeholder,
  required,
  className,
  id,
  name,
  autoFocus,
  mode = 'single',
  excludeAddresses = [],
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // In multi-address mode (e.g. CC/BCC), extract the current segment being typed
  const getCurrentQuery = useCallback((): string => {
    if (mode === 'single') {
      return value;
    }
    const parts = value.split(/[,;]/);
    return parts[parts.length - 1]?.trim() || '';
  }, [value, mode]);

  const currentQuery = getCurrentQuery();

  // Compute suggestions based on current query
  const suggestions = useMemo(() => {
    if (!isOpen) return [];
    return searchContacts(contacts, currentQuery, {
      currentProjectId,
      limit: 7,
      excludeAddresses,
    });
  }, [contacts, currentQuery, currentProjectId, excludeAddresses, isOpen]);

  // Reset highlight index when suggestions change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [suggestions]);

  // Close when clicking outside
  useEffect(() => {
    const handlePointerDownOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDownOutside);
    document.addEventListener('touchstart', handlePointerDownOutside);
    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
      document.removeEventListener('touchstart', handlePointerDownOutside);
    };
  }, []);

  const handleSelect = useCallback(
    (contact: Contact) => {
      if (mode === 'single') {
        onChange(contact.address);
      } else {
        // Multi-address mode: replace the current active token
        const parts = value.split(/[,;]/);
        parts.pop(); // remove last typed segment
        const prefix = parts.map((p) => p.trim()).filter(Boolean).join(', ');
        const nextValue = prefix ? `${prefix}, ${contact.address}, ` : `${contact.address}, `;
        onChange(nextValue);
      }
      if (onSelectContact) {
        onSelectContact(contact);
      }
      setIsOpen(false);
      inputRef.current?.focus();
    },
    [mode, onChange, onSelectContact, value]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      if (suggestions[highlightedIndex]) {
        e.preventDefault();
        e.stopPropagation();
        handleSelect(suggestions[highlightedIndex]);
      }
    } else if (e.key === 'Tab') {
      if (suggestions[highlightedIndex] && currentQuery.trim().length > 0) {
        e.preventDefault();
        handleSelect(suggestions[highlightedIndex]);
      } else {
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        id={id}
        name={name}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck="false"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        className={
          className ||
          'w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-[#1f1f1f] placeholder:text-slate-500 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500'
        }
      />

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 max-h-[300px] overflow-y-auto">
          {/* Header indicator */}
          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-blue-500" />
              {!currentQuery.trim() ? 'Recent Contacts & Senders' : 'Matching Contacts'}
            </span>
            <span className="text-[10px] text-slate-400">↑↓ to navigate · Enter to select</span>
          </div>

          {suggestions.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400">
              No contacts found for &quot;<strong className="text-slate-600 dark:text-slate-200">{currentQuery}</strong>&quot;.
              <div className="text-[11px] mt-0.5 text-slate-400">Type full email to address directly.</div>
            </div>
          ) : (
            <ul role="listbox" className="p-1 space-y-0.5">
              {suggestions.map((contact, idx) => {
                const isSelected = idx === highlightedIndex;
                const colors = getAvatarColor(contact.address);

                return (
                  <li
                    key={contact.address}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelect(contact)}
                    className={`px-2.5 py-2 rounded-xl flex items-center justify-between gap-2.5 cursor-pointer transition select-none ${
                      isSelected
                        ? 'bg-blue-50/90 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 border border-blue-200/80 dark:border-blue-800/80 shadow-2xs'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-[#1f1f1f] dark:text-slate-200 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Avatar initials */}
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 ${colors.bg} ${colors.text}`}
                      >
                        {contact.avatar || contact.name.slice(0, 2).toUpperCase()}
                      </div>

                      {/* Name & Address */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs truncate">
                            <HighlightMatch text={contact.name} query={currentQuery} />
                          </span>

                          {contact.isSender && (
                            <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 font-bold text-[9.5px] shrink-0 border border-emerald-300/60">
                              Sender
                            </span>
                          )}

                          {currentProjectId && contact.projectIds.includes(currentProjectId) && (
                            <span className="px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 font-semibold text-[9.5px] shrink-0">
                              This Project
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-[#4b5563] dark:text-slate-400 truncate flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          <HighlightMatch text={contact.displayAddress} query={currentQuery} />
                        </div>
                      </div>
                    </div>

                    {/* Quick action helper or subject hint */}
                    <div className="shrink-0 flex items-center gap-1 text-[11px] text-slate-400">
                      {contact.recentSubject ? (
                        <span className="text-[10px] text-slate-400 max-w-[120px] truncate hidden sm:inline" title={contact.recentSubject}>
                          {contact.recentSubject}
                        </span>
                      ) : null}
                      <ArrowDownRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
