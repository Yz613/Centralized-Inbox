import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Strikethrough,
  RemoveFormatting,
  Sparkles,
} from 'lucide-react';

export interface RichTextEditorRef {
  focus: () => void;
  setHtml: (html: string) => void;
  getHtml: () => string;
  getText: () => string;
  insertHtmlAtCursor: (html: string) => void;
  replaceContent: (html: string) => void;
}

export interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string, plainText: string) => void;
  placeholder?: string;
  minHeight?: string;
  maxHeight?: string;
  className?: string;
  onPasteBlob?: (pastedText: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onKeyUp?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onCleanWithAi?: () => void;
  showAiButton?: boolean;
  isAiProcessing?: boolean;
  toolbarPosition?: 'top' | 'bottom';
  showToolbarDefault?: boolean;
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  (
    {
      value = '',
      onChange,
      placeholder = 'Write your message here...',
      minHeight = '100px',
      maxHeight = '280px',
      className = '',
      onPasteBlob,
      onKeyDown,
      onKeyUp,
      onClick,
      onCleanWithAi,
      showAiButton = true,
      isAiProcessing = false,
      toolbarPosition = 'bottom',
      showToolbarDefault = true,
    },
    ref
  ) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const lastHtmlRef = useRef<string>('');
    const [isFocused, setIsFocused] = useState(false);
    const [showToolbar, setShowToolbar] = useState(showToolbarDefault);

    // Active format states
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);
    const [isStrike, setIsStrike] = useState(false);
    const [isBulletList, setIsBulletList] = useState(false);
    const [isNumberedList, setIsNumberedList] = useState(false);

    // Update active format states
    const updateActiveFormats = useCallback(() => {
      if (typeof document === 'undefined') return;
      try {
        setIsBold(document.queryCommandState('bold'));
        setIsItalic(document.queryCommandState('italic'));
        setIsUnderline(document.queryCommandState('underline'));
        setIsStrike(document.queryCommandState('strikeThrough'));
        setIsBulletList(document.queryCommandState('insertUnorderedList'));
        setIsNumberedList(document.queryCommandState('insertOrderedList'));
      } catch {
        // Query command state may fail if selection is outside
      }
    }, []);

    // Sync from props only when value is different from internal cache
    useEffect(() => {
      if (!editorRef.current) return;
      if (value !== lastHtmlRef.current) {
        editorRef.current.innerHTML = value || '';
        lastHtmlRef.current = value || '';
      }
    }, [value]);

    const handleInput = () => {
      if (!editorRef.current) return;
      const html = editorRef.current.innerHTML;
      const text = editorRef.current.innerText || '';
      lastHtmlRef.current = html;
      updateActiveFormats();
      if (onChange) {
        onChange(html, text);
      }
    };

    const exec = (cmd: string, arg: string | undefined = undefined) => {
      if (!editorRef.current) return;
      // Preserve active text selection: do not re-focus if focus is already inside the editor
      if (document.activeElement !== editorRef.current && !editorRef.current.contains(document.activeElement)) {
        editorRef.current.focus();
      }
      document.execCommand(cmd, false, arg);
      updateActiveFormats();
      handleInput();
    };

    useImperativeHandle(ref, () => ({
      focus: () => {
        editorRef.current?.focus();
      },
      setHtml: (html: string) => {
        if (!editorRef.current) return;
        editorRef.current.innerHTML = html;
        lastHtmlRef.current = html;
        handleInput();
      },
      getHtml: () => editorRef.current?.innerHTML || '',
      getText: () => editorRef.current?.innerText || '',
      insertHtmlAtCursor: (html: string) => {
        if (!editorRef.current) return;
        if (document.activeElement !== editorRef.current && !editorRef.current.contains(document.activeElement)) {
          editorRef.current.focus();
        }
        document.execCommand('insertHTML', false, html);
        handleInput();
      },
      replaceContent: (html: string) => {
        if (!editorRef.current) return;
        editorRef.current.innerHTML = html;
        lastHtmlRef.current = html;
        handleInput();
        editorRef.current.focus();
      },
    }));

    // Listen to selection change for active format buttons
    useEffect(() => {
      const handleSelectionChange = () => {
        if (
          document.activeElement === editorRef.current ||
          editorRef.current?.contains(document.activeElement)
        ) {
          updateActiveFormats();
        }
      };
      document.addEventListener('selectionchange', handleSelectionChange);
      return () => {
        document.removeEventListener('selectionchange', handleSelectionChange);
      };
    }, [updateActiveFormats]);

    const handlePaste = (_e: React.ClipboardEvent<HTMLDivElement>) => {
      // Natural paste: allow browser native paste into contenteditable without unprompted popups
      setTimeout(handleInput, 0);
    };

    const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLDivElement>) => {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && !e.altKey) {
        const key = e.key.toLowerCase();

        // Bold: Ctrl+B or Cmd+B
        if (key === 'b' && !e.shiftKey) {
          window.setTimeout(() => {
            updateActiveFormats();
            handleInput();
          }, 0);
          return;
        }

        // Italic: Ctrl+I or Cmd+I
        if (key === 'i' && !e.shiftKey) {
          window.setTimeout(() => {
            updateActiveFormats();
            handleInput();
          }, 0);
          return;
        }

        // Underline: Ctrl+U or Cmd+U
        if (key === 'u' && !e.shiftKey) {
          window.setTimeout(() => {
            updateActiveFormats();
            handleInput();
          }, 0);
          return;
        }

        // Insert Link: Ctrl+K or Cmd+K
        if (key === 'k' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          const url = window.prompt('Enter link URL (e.g. https://example.com):', '');
          if (url && url.trim()) {
            const formatted = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
            exec('createLink', formatted);
          }
          return;
        }

        // Strikethrough: Ctrl+Shift+X or Cmd+Shift+X (or Ctrl+Shift+5)
        if (e.shiftKey && (key === 'x' || key === '5')) {
          e.preventDefault();
          e.stopPropagation();
          exec('strikeThrough');
          return;
        }

        // Clear formatting: Ctrl+\ or Cmd+\
        if (key === '\\') {
          e.preventDefault();
          e.stopPropagation();
          exec('removeFormat');
          return;
        }

        // Numbered list: Ctrl+Shift+7 or Cmd+Shift+7
        if (e.shiftKey && (key === '7' || key === '&')) {
          e.preventDefault();
          e.stopPropagation();
          exec('insertOrderedList');
          return;
        }

        // Bulleted list: Ctrl+Shift+8 or Cmd+Shift+8
        if (e.shiftKey && (key === '8' || key === '*')) {
          e.preventDefault();
          e.stopPropagation();
          exec('insertUnorderedList');
          return;
        }

        // Blockquote: Ctrl+Shift+9 or Cmd+Shift+9
        if (e.shiftKey && (key === '9' || key === '(')) {
          e.preventDefault();
          e.stopPropagation();
          exec('formatBlock', 'blockquote');
          return;
        }

        // Indent: Ctrl+] or Cmd+]
        if (key === ']') {
          e.preventDefault();
          e.stopPropagation();
          exec('indent');
          return;
        }

        // Outdent: Ctrl+[ or Cmd+[
        if (key === '[') {
          e.preventDefault();
          e.stopPropagation();
          exec('outdent');
          return;
        }

        // Undo: Ctrl+Z or Cmd+Z
        if (key === 'z' && !e.shiftKey) {
          window.setTimeout(() => {
            updateActiveFormats();
            handleInput();
          }, 0);
          return;
        }

        // Redo: Ctrl+Y or Ctrl+Shift+Z or Cmd+Shift+Z
        if (key === 'y' || (key === 'z' && e.shiftKey)) {
          window.setTimeout(() => {
            updateActiveFormats();
            handleInput();
          }, 0);
          return;
        }
      }

      if (onKeyDown) {
        onKeyDown(e);
      }
    };

    const isEmpty = !value || value.trim() === '' || value === '<br>' || value === '<p></p>';

    const toolbar = (
      <div className="flex items-center justify-between gap-1 px-3 py-1.5 bg-slate-50/90 border-b border-slate-200 text-slate-700 select-none flex-wrap">
        <div className="flex items-center gap-0.5 sm:gap-1 flex-wrap">
          {/* Bold */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              exec('bold');
            }}
            title="Bold (⌘B)"
            className={`p-1.5 rounded hover:bg-slate-200 transition cursor-pointer ${
              isBold ? 'bg-slate-300 text-black font-bold shadow-2xs' : 'text-slate-700'
            }`}
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          {/* Italic */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              exec('italic');
            }}
            title="Italic (⌘I)"
            className={`p-1.5 rounded hover:bg-slate-200 transition cursor-pointer ${
              isItalic ? 'bg-slate-300 text-black font-bold shadow-2xs' : 'text-slate-700'
            }`}
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          {/* Underline */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              exec('underline');
            }}
            title="Underline (⌘U)"
            className={`p-1.5 rounded hover:bg-slate-200 transition cursor-pointer ${
              isUnderline ? 'bg-slate-300 text-black font-bold shadow-2xs' : 'text-slate-700'
            }`}
          >
            <Underline className="w-3.5 h-3.5" />
          </button>

          {/* Strikethrough */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              exec('strikeThrough');
            }}
            title="Strikethrough"
            className={`p-1.5 rounded hover:bg-slate-200 transition cursor-pointer ${
              isStrike ? 'bg-slate-300 text-black font-bold shadow-2xs' : 'text-slate-700'
            }`}
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-4 bg-slate-300 mx-1" />

          {/* Bulleted List */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              exec('insertUnorderedList');
            }}
            title="Bulleted list"
            className={`p-1.5 rounded hover:bg-slate-200 transition cursor-pointer ${
              isBulletList ? 'bg-slate-300 text-black font-bold shadow-2xs' : 'text-slate-700'
            }`}
          >
            <List className="w-3.5 h-3.5" />
          </button>

          {/* Numbered List */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              exec('insertOrderedList');
            }}
            title="Numbered list"
            className={`p-1.5 rounded hover:bg-slate-200 transition cursor-pointer ${
              isNumberedList ? 'bg-slate-300 text-black font-bold shadow-2xs' : 'text-slate-700'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-4 bg-slate-300 mx-1" />

          {/* Clear Formatting */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              exec('removeFormat');
            }}
            title="Clear formatting"
            className="p-1.5 rounded hover:bg-slate-200 transition cursor-pointer text-slate-700"
          >
            <RemoveFormatting className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* AI Clean Format button right inside the toolbar */}
        {showAiButton && onCleanWithAi && (
          <button
            type="button"
            onClick={onCleanWithAi}
            disabled={isAiProcessing || isEmpty}
            title="Format this text cleanly with AI (lists, bolding, underline, airy spacing)"
            className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border transition cursor-pointer shadow-2xs ${
              isEmpty
                ? 'opacity-50 cursor-not-allowed border-slate-200 bg-white text-slate-400'
                : 'bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 text-indigo-900 border-indigo-200 active:scale-95'
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 text-indigo-600 ${isAiProcessing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isAiProcessing ? 'Formatting…' : 'AI Format Cleanly'}</span>
            <span className="sm:hidden">{isAiProcessing ? '…' : 'AI Clean'}</span>
          </button>
        )}
      </div>
    );

    return (
      <div className={`relative flex flex-col w-full ${className}`}>
        {toolbarPosition === 'top' && showToolbar && toolbar}

        {/* The rich-text editable div */}
        <div className="relative w-full flex-1 min-h-0">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onPaste={handlePaste}
            onKeyDown={handleKeyDownInternal}
            onKeyUp={(e) => {
              updateActiveFormats();
              if (onKeyUp) onKeyUp(e);
            }}
            onClick={(e) => {
              updateActiveFormats();
              if (onClick) onClick(e);
            }}
            onFocus={() => {
              setIsFocused(true);
              updateActiveFormats();
            }}
            onBlur={() => {
              setIsFocused(false);
              updateActiveFormats();
            }}
            style={{
              minHeight,
              maxHeight,
            }}
            className="w-full p-3 sm:p-4 text-xs md:text-sm text-[#1f1f1f] bg-transparent focus:outline-none overflow-y-auto leading-relaxed font-sans selection:bg-blue-100 selection:text-blue-900 [overflow-wrap:anywhere]"
          />

          {/* Placeholder overlay when empty */}
          {isEmpty && !isFocused && (
            <div
              onClick={() => editorRef.current?.focus()}
              className="absolute left-3 sm:left-4 top-3 sm:top-4 text-slate-400 text-xs md:text-sm pointer-events-none select-none"
            >
              {placeholder}
            </div>
          )}
        </div>

        {toolbarPosition === 'bottom' && showToolbar && toolbar}
      </div>
    );
  }
);

RichTextEditor.displayName = 'RichTextEditor';
