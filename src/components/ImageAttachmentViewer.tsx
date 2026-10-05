import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, ImageOff, Loader2, Maximize, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { Attachment } from '../types';
import { loadAttachmentSource, downloadAttachmentSource, type AttachmentSource } from '../services/attachmentSource';

interface ImageAttachmentViewerProps {
  attachments: Attachment[];
  initialIndex: number;
  onClose: () => void;
}

const controlClass = 'inline-flex items-center justify-center rounded-lg p-2.5 text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer';

function ImagePreview({ attachment, onClose, navigation }: {
  attachment: Attachment;
  onClose: () => void;
  navigation: React.ReactNode;
}) {
  const [source, setSource] = useState<AttachmentSource | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  // Fit opens the whole image; percentage zoom uses the image's original dimensions.
  const [zoom, setZoom] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const imageRef = useRef<HTMLImageElement>(null);

  const changeZoom = (factor: number) => setZoom((value) => {
    const current = value ?? (imageRef.current!.getBoundingClientRect().width / dimensions.width);
    return factor < 1 ? Math.min(current, Math.max(0.01, current * factor)) : Math.min(4, current * factor);
  });

  useEffect(() => {
    const controller = new AbortController();
    let resource: AttachmentSource | undefined;
    setSource(null);
    setLoaded(false);
    setError('');
    loadAttachmentSource(attachment, controller.signal).then((result) => {
      if (controller.signal.aborted) { result.release(); return; }
      resource = result;
      setSource(result);
    }).catch((err) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load this image.');
    });
    return () => { controller.abort(); resource?.release(); };
  }, [attachment, attempt]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-white">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-slate-900 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 id="attachment-viewer-title" className="truncate text-sm font-semibold" title={attachment.name}>{attachment.name || 'Image attachment'}</h2>
          <p className="mt-0.5 text-xs text-slate-400">{attachment.size}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className={controlClass} disabled={!loaded || !!error || (zoom !== null && zoom <= 0.01)} onClick={() => changeZoom(0.8)} aria-label="Zoom out" title="Zoom out"><ZoomOut className="h-5 w-5" /></button>
          <span className="hidden w-12 text-center text-xs tabular-nums sm:block">{zoom === null ? 'Fit' : `${Math.round(zoom * 100)}%`}</span>
          <button type="button" className={controlClass} disabled={!loaded || !!error || (zoom ?? 1) >= 4} onClick={() => changeZoom(1.25)} aria-label="Zoom in" title="Zoom in"><ZoomIn className="h-5 w-5" /></button>
          <button type="button" className={controlClass} disabled={!loaded || !!error} onClick={() => setZoom(null)} aria-label="Fit image to screen" title="Fit image to screen"><Maximize className="h-5 w-5" /></button>
          <button type="button" className={controlClass} disabled={!source} onClick={() => source && downloadAttachmentSource(attachment, source.url)} aria-label={`Download ${attachment.name}`} title="Download image"><Download className="h-5 w-5" /></button>
          <button type="button" autoFocus className={controlClass} onClick={onClose} aria-label="Close image preview" title="Close (Esc)"><X className="h-5 w-5" /></button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {(!loaded && !error) && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-3 text-sm text-slate-300" role="status"><Loader2 className="h-5 w-5 animate-spin" />Loading image…</div>
        )}
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center" role="alert">
            <ImageOff className="h-10 w-10 text-slate-400" />
            <p className="font-semibold">Unable to preview this image</p>
            <p className="max-w-md text-sm text-slate-300">{error}</p>
            <button type="button" className="mt-2 rounded-lg border border-white/25 px-4 py-2 text-sm hover:bg-white/10 cursor-pointer" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
          </div>
        ) : (
          <div className="h-full w-full overflow-auto overscroll-contain" onDoubleClick={() => loaded && setZoom((value) => value === null ? 1 : null)}>
            <div
              className={zoom === null ? 'flex h-full w-full items-center justify-center p-4 sm:p-8' : 'grid min-h-full min-w-full w-max place-items-center p-4 sm:p-8'}
              onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
            >
              {source && (
                <img
                  ref={imageRef}
                  src={source.url}
                  alt={attachment.name || 'Email image attachment'}
                  className={zoom === null ? 'max-h-full max-w-full object-contain' : 'max-w-none shrink-0'}
                  style={{ visibility: loaded ? 'visible' : 'hidden', ...(zoom !== null && loaded ? { width: dimensions.width * zoom, height: dimensions.height * zoom } : {}) }}
                  referrerPolicy="no-referrer"
                  draggable={false}
                  onLoad={(event) => {
                    setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
                    setLoaded(true);
                  }}
                  onError={() => setError('Your browser could not display this image. You can still download the original file using the button above.')}
                />
              )}
            </div>
          </div>
        )}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-white/10 bg-slate-900 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {navigation}
        <span className="hidden text-xs text-slate-400 sm:inline">Double-click to switch between fit and actual size · Esc to close</span>
      </footer>
    </div>
  );
}

export function ImageAttachmentViewer({ attachments, initialIndex, onClose }: ImageAttachmentViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      data-attachment-viewer
      aria-labelledby="attachment-viewer-title"
      aria-modal="true"
      className="fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none border-0 p-0 backdrop:bg-slate-950/95"
      onCancel={(event) => { event.preventDefault(); closeRef.current(); }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); }
        if (event.key === 'ArrowRight') { event.preventDefault(); setIndex((value) => Math.min(attachments.length - 1, value + 1)); }
      }}
    >
      <ImagePreview
        key={index}
        attachment={attachments[index]}
        onClose={onClose}
        navigation={attachments.length > 1 ? (
          <div className="flex items-center gap-3">
            <button type="button" className={controlClass} disabled={index === 0} onClick={() => setIndex((value) => value - 1)} aria-label="Previous image" title="Previous image (←)"><ChevronLeft className="h-5 w-5" /></button>
            <span className="text-xs text-slate-300" aria-live="polite">{index + 1} / {attachments.length}</span>
            <button type="button" className={controlClass} disabled={index === attachments.length - 1} onClick={() => setIndex((value) => value + 1)} aria-label="Next image" title="Next image (→)"><ChevronRight className="h-5 w-5" /></button>
          </div>
        ) : null}
      />
    </dialog>,
    document.body,
  );
}
