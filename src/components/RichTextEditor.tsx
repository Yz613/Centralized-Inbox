import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Image as ImageIcon,
  Indent,
  Italic,
  Link2,
  List,
  ListOrdered,
  Outdent,
  Quote,
  RemoveFormatting,
  Sparkles,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { mentionAtCursor } from '../utils/replyMentions';
import {
  clipboardFiles,
  embedImageFile,
  imageEmbedHtml,
  isImageFile,
  mentionChipHtml,
} from '../utils/composeMedia';

export interface MentionAnchor {
  query: string;
  top: number;
  left: number;
}

export interface RichTextEditorRef {
  focus: () => void;
  setHtml: (html: string) => void;
  getHtml: () => string;
  getText: () => string;
  insertHtmlAtCursor: (html: string) => void;
  replaceContent: (html: string) => void;
  replaceActiveMention: (name: string, address: string) => void;
  insertFiles: (files: File[], point?: { x: number; y: number }) => Promise<void>;
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
  onAttachFiles?: (files: File[]) => void;
  onFileError?: (message: string) => void;
  onMentionChange?: (mention: MentionAnchor | null) => void;
  showAiButton?: boolean;
  isAiProcessing?: boolean;
  toolbarPosition?: 'top' | 'bottom';
  showToolbarDefault?: boolean;
}

function mentionTextFromFragment(fragment: DocumentFragment): string {
  let text = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || '';
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.hasAttribute('data-mention')) {
      text += ' ';
      return;
    }
    if (node.tagName === 'BR') {
      text += '\n';
      return;
    }
    const block = /^(DIV|P|LI|BLOCKQUOTE|H[1-6]|TR)$/.test(node.tagName);
    node.childNodes.forEach(walk);
    if (block && text && !text.endsWith('\n')) text += '\n';
  };
  fragment.childNodes.forEach(walk);
  return text.replace(/\n$/, '');
}

function activeMention(root: HTMLElement): { query: string } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
  const caret = selection.getRangeAt(0);
  if (!root.contains(caret.endContainer)) return null;
  const range = document.createRange();
  range.selectNodeContents(root);
  try {
    range.setEnd(caret.endContainer, caret.endOffset);
  } catch {
    return null;
  }
  const mention = mentionAtCursor(mentionTextFromFragment(range.cloneContents()), Number.MAX_SAFE_INTEGER);
  return mention ? { query: mention.query } : null;
}

function lastTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text;
  for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
    const found = lastTextNode(node.childNodes[index]);
    if (found) return found;
  }
  return null;
}

function deleteCharsBeforeCaret(root: HTMLElement, count: number) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || count <= 0) return;
  const caret = selection.getRangeAt(0);
  let endNode = caret.endContainer;
  let endOffset = caret.endOffset;
  if (endNode.nodeType !== Node.TEXT_NODE) {
    const previous = endNode.childNodes[endOffset - 1];
    const text = previous ? lastTextNode(previous) : null;
    if (!text) return;
    endNode = text;
    endOffset = text.length;
  }

  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest('[data-mention]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    if (current === endNode) break;
    current = walker.nextNode();
  }

  let remaining = count;
  for (let index = nodes.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const textNode = nodes[index];
    const available = textNode === endNode ? endOffset : textNode.length;
    const take = Math.min(remaining, available);
    const start = available - take;
    textNode.deleteData(start, take);
    remaining -= take;
    if (remaining === 0) {
      const next = document.createRange();
      next.setStart(textNode, start);
      next.collapse(true);
      selection.removeAllRanges();
      selection.addRange(next);
      return;
    }
  }
}

function placeCaret(root: HTMLElement, x: number, y: number) {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let range = doc.caretRangeFromPoint?.(x, y) || null;
  if (!range && doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(x, y);
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }
  }
  if (!range || !root.contains(range.startContainer)) {
    root.focus();
    return;
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
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
      onAttachFiles,
      onFileError,
      onMentionChange,
      showAiButton = true,
      isAiProcessing = false,
      toolbarPosition = 'bottom',
      showToolbarDefault = true,
    },
    ref
  ) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const lastHtmlRef = useRef<string>('');
    const dragDepth = useRef(0);
    const [isDragging, setIsDragging] = useState(false);
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

    const focusEditor = () => {
      const root = editorRef.current;
      if (!root) return null;
      if (document.activeElement !== root && !root.contains(document.activeElement)) root.focus();
      document.execCommand('defaultParagraphSeparator', false, 'div');
      return root;
    };

    const stampListStyles = (root: HTMLElement) => {
      root.querySelectorAll('ul').forEach((list) => {
        list.style.listStyle = 'disc outside';
        list.style.margin = '0.45em 0 0.45em 1.4em';
        list.style.paddingLeft = '0.35em';
      });
      root.querySelectorAll('ol').forEach((list) => {
        list.style.listStyle = 'decimal outside';
        list.style.margin = '0.45em 0 0.45em 1.4em';
        list.style.paddingLeft = '0.35em';
      });
      root.querySelectorAll('li').forEach((item) => {
        item.style.display = 'list-item';
        item.style.margin = '0.15em 0';
      });
    };

    const exec = (cmd: string, arg: string | undefined = undefined) => {
      if (!focusEditor()) return;
      document.execCommand(cmd, false, arg);
      if (editorRef.current) stampListStyles(editorRef.current);
      updateActiveFormats();
      handleInput();
    };

    const toggleList = (ordered: boolean) => {
      const root = focusEditor();
      if (!root) return;
      const selection = window.getSelection();
      const empty = !root.textContent?.trim() && !root.querySelector('img, ul, ol, li');
      if (empty || !selection || selection.rangeCount === 0 || !selection.anchorNode || !root.contains(selection.anchorNode)) {
        if (!root.innerHTML || root.innerHTML === '<br>') root.innerHTML = '<div><br></div>';
        const block = root.querySelector('div, p') || root;
        const range = document.createRange();
        range.selectNodeContents(block);
        range.collapse(true);
        const next = window.getSelection();
        next?.removeAllRanges();
        next?.addRange(range);
      }
      const before = root.innerHTML;
      const applied = document.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList');
      if (!applied || root.innerHTML === before) {
        const list = document.createElement(ordered ? 'ol' : 'ul');
        const item = document.createElement('li');
        item.innerHTML = root.innerHTML && root.innerHTML !== '<br>' ? root.innerHTML : '<br>';
        list.appendChild(item);
        root.innerHTML = '';
        root.appendChild(list);
        const range = document.createRange();
        range.selectNodeContents(item);
        range.collapse(true);
        const next = window.getSelection();
        next?.removeAllRanges();
        next?.addRange(range);
      }
      stampListStyles(root);
      updateActiveFormats();
      handleInput();
    };

    const emitMention = useCallback(() => {
      const root = editorRef.current;
      const host = hostRef.current;
      if (!root || !host || !onMentionChange) return;
      const mention = activeMention(root);
      if (!mention) {
        onMentionChange(null);
        return;
      }
      const selection = window.getSelection();
      const rect = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).getBoundingClientRect() : null;
      const hostRect = host.getBoundingClientRect();
      const hasCaret = Boolean(rect && (rect.width > 0 || rect.height > 0 || rect.top > 0));
      onMentionChange({
        query: mention.query,
        top: (hasCaret ? rect!.bottom : hostRect.top + 28) + 4,
        left: Math.max(8, hasCaret ? rect!.left : hostRect.left + 12),
      });
    }, [onMentionChange]);

    const insertHtml = (html: string) => {
      const root = editorRef.current;
      if (!root) return;
      if (document.activeElement !== root && !root.contains(document.activeElement)) root.focus();
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !root.contains(selection.anchorNode)) {
        document.execCommand('insertHTML', false, html);
      } else {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const template = document.createElement('template');
        template.innerHTML = html;
        const fragment = template.content;
        const last = fragment.lastChild;
        range.insertNode(fragment);
        if (last) {
          range.setStartAfter(last);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      handleInput();
      emitMention();
    };

    const insertIncomingFiles = async (files: File[], point?: { x: number; y: number }) => {
      if (!files.length || !editorRef.current) return;
      if (point) placeCaret(editorRef.current, point.x, point.y);
      else editorRef.current.focus();
      const images = files.filter((file) => isImageFile(file));
      const others = files.filter((file) => !isImageFile(file));
      for (const image of images) {
        const embedded = await embedImageFile(image);
        if (!embedded) {
          onFileError?.(`${image.name || 'That image'} is over 20 MB.`);
          continue;
        }
        insertHtml(imageEmbedHtml(embedded.dataUrl, embedded.name));
      }
      if (others.length > 0) onAttachFiles?.(others);
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
        insertHtml(html);
      },
      replaceContent: (html: string) => {
        if (!editorRef.current) return;
        editorRef.current.innerHTML = html;
        lastHtmlRef.current = html;
        handleInput();
        editorRef.current.focus();
        emitMention();
      },
      replaceActiveMention: (name: string, address: string) => {
        const root = editorRef.current;
        if (!root) return;
        const selection = window.getSelection();
        const inside = Boolean(selection && selection.rangeCount > 0 && selection.anchorNode && root.contains(selection.anchorNode));
        if (!inside) root.focus();
        const mention = activeMention(root);
        if (mention) deleteCharsBeforeCaret(root, mention.query.length + 1);
        insertHtml(mentionChipHtml(name, address));
      },
      insertFiles: (files: File[], point?: { x: number; y: number }) => insertIncomingFiles(files, point),
    }));

    // Listen to selection change for active format buttons and @ mentions
    useEffect(() => {
      const handleSelectionChange = () => {
        if (
          document.activeElement === editorRef.current ||
          editorRef.current?.contains(document.activeElement)
        ) {
          updateActiveFormats();
          emitMention();
        }
      };
      document.addEventListener('selectionchange', handleSelectionChange);
      return () => {
        document.removeEventListener('selectionchange', handleSelectionChange);
      };
    }, [updateActiveFormats, emitMention]);

    const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
      const files = clipboardFiles(event.clipboardData);
      const images = files.filter((file) => isImageFile(file));
      const others = files.filter((file) => !isImageFile(file));
      if (images.length > 0 || (files.length > 0 && others.length === files.length)) {
        event.preventDefault();
        if (images.length > 0) void insertIncomingFiles(images);
        if (others.length > 0) onAttachFiles?.(others);
        return;
      }
      // Text paste stays native so formatting from other apps is preserved.
      setTimeout(() => {
        handleInput();
        emitMention();
      }, 0);
    };

    const insertLink = () => {
      const url = window.prompt('Enter link URL (e.g. https://example.com):', '');
      if (!url || !url.trim()) return;
      const formatted = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
      exec('createLink', formatted);
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
          insertLink();
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
          toggleList(true);
          return;
        }

        // Bulleted list: Ctrl+Shift+8 or Cmd+Shift+8
        if (e.shiftKey && (key === '8' || key === '*')) {
          e.preventDefault();
          e.stopPropagation();
          toggleList(false);
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
              toggleList(false);
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
              toggleList(true);
            }}
            title="Numbered list"
            className={`p-1.5 rounded hover:bg-slate-200 transition cursor-pointer ${
              isNumberedList ? 'bg-slate-300 text-black font-bold shadow-2xs' : 'text-slate-700'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-4 bg-slate-300 mx-1" />

          <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('justifyLeft'); }} title="Align left" className="p-1.5 rounded hover:bg-slate-200 transition cursor-pointer text-slate-700">
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('justifyCenter'); }} title="Align center" className="p-1.5 rounded hover:bg-slate-200 transition cursor-pointer text-slate-700">
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('justifyRight'); }} title="Align right" className="p-1.5 rounded hover:bg-slate-200 transition cursor-pointer text-slate-700">
            <AlignRight className="w-3.5 h-3.5" />
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('indent'); }} title="Indent" className="p-1.5 rounded hover:bg-slate-200 transition cursor-pointer text-slate-700">
            <Indent className="w-3.5 h-3.5" />
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('outdent'); }} title="Outdent" className="p-1.5 rounded hover:bg-slate-200 transition cursor-pointer text-slate-700">
            <Outdent className="w-3.5 h-3.5" />
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'blockquote'); }} title="Quote" className="p-1.5 rounded hover:bg-slate-200 transition cursor-pointer text-slate-700">
            <Quote className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-4 bg-slate-300 mx-1" />

          <button type="button" onMouseDown={(e) => { e.preventDefault(); insertLink(); }} title="Insert link (⌘K)" className="p-1.5 rounded hover:bg-slate-200 transition cursor-pointer text-slate-700">
            <Link2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); imageInputRef.current?.click(); }} title="Insert image" className="p-1.5 rounded hover:bg-slate-200 transition cursor-pointer text-slate-700">
            <ImageIcon className="w-3.5 h-3.5" />
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
      <div
        ref={hostRef}
        className={`relative flex flex-col w-full ${className}`}
        onDragEnter={(event) => {
          if (!event.dataTransfer.types?.includes('Files')) return;
          event.preventDefault();
          dragDepth.current += 1;
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types?.includes('Files')) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setIsDragging(false);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types?.includes('Files')) return;
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current = 0;
          setIsDragging(false);
          void insertIncomingFiles(Array.from(event.dataTransfer.files || []), { x: event.clientX, y: event.clientY });
        }}
      >
        {toolbarPosition === 'top' && showToolbar && toolbar}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = '';
            void insertIncomingFiles(files);
          }}
        />

        {/* The rich-text editable div */}
        <div className="relative w-full flex-1 min-h-0">
          {isDragging && (
            <div className="absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-[#0b57d0] bg-[#e8f0fe]/90 text-sm font-semibold text-[#174ea6] pointer-events-none">
              Drop images into the email, or files to attach
            </div>
          )}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => {
              handleInput();
              emitMention();
            }}
            onPaste={handlePaste}
            onKeyDown={handleKeyDownInternal}
            onKeyUp={(e) => {
              updateActiveFormats();
              emitMention();
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
            className="compose-editor w-full p-3 sm:p-4 text-xs md:text-sm text-[#1f1f1f] bg-transparent focus:outline-none overflow-y-auto leading-relaxed font-sans selection:bg-blue-100 selection:text-blue-900 [overflow-wrap:anywhere]"
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
