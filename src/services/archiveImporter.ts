import JSZip from 'jszip';
import PostalMime from 'postal-mime';
import { Thread, Message, ChannelType, InboxRole } from '../types';

export interface ImportProgress {
  phase: 'inspecting' | 'extracting' | 'parsing' | 'threading' | 'uploading' | 'complete';
  message: string;
  current: number;
  total: number;
}

export interface ParseArchiveOptions {
  projectId: string;
  inboxId: string;
  channel?: ChannelType;
  inboxRole?: InboxRole;
  onProgress?: (progress: ImportProgress) => void;
}

export interface ParseResult {
  threads: Thread[];
  totalMessages: number;
  archiveType: string;
}

/**
 * Normalizes email subjects by removing Re:, Fwd:, and brackets
 */
function normalizeSubject(subj?: string): string {
  if (!subj) return '(no subject)';
  return subj
    .replace(/^(?:\[[^\]]*\]\s*)/g, '')
    .replace(/^(?:re|fwd|fw):\s*/i, '')
    .replace(/^(?:re|fwd|fw):\s*/i, '')
    .trim()
    .toLowerCase();
}

/**
 * Parses an MBOX string or raw text into RFC 822 message chunks
 */
function splitMboxIntoMessages(mboxText: string): string[] {
  const separator = /(?:^|\r?\n)From\s+[^\r\n]*(?:\r?\n|$)/g;
  const messages: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = separator.exec(mboxText)) !== null) {
    if (match.index > lastIndex) {
      const msg = mboxText.slice(lastIndex, match.index).trim();
      if (msg) {
        // In MBOXrd format, '>From ' is unescaped to 'From '
        messages.push(msg.replace(/^>+From /gm, 'From '));
      }
    }
    lastIndex = match.index + match[0].length;
  }

  // Trailing message after last separator
  if (lastIndex < mboxText.length) {
    const trailing = mboxText.slice(lastIndex).trim();
    if (trailing) {
      messages.push(trailing.replace(/^>+From /gm, 'From '));
    }
  }

  return messages;
}

/**
 * Parses and reconstructs threads from a Zip, MBOX, or EML file.
 */
export async function parseEmailArchive(
  file: File,
  options: ParseArchiveOptions
): Promise<ParseResult> {
  const { projectId, inboxId, channel = 'gmail', inboxRole = 'general', onProgress } = options;

  const rawMessages: string[] = [];
  let archiveType = 'Unknown Archive';

  const updateProgress = (phase: ImportProgress['phase'], message: string, current: number, total: number) => {
    if (onProgress) {
      onProgress({ phase, message, current, total });
    }
  };

  updateProgress('inspecting', `Reading file ${file.name}...`, 0, 100);

  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.zip')) {
    updateProgress('inspecting', 'Inspecting ZIP archive contents...', 10, 100);
    const zip = await JSZip.loadAsync(file);

    // Check for MBOX files (e.g. Google Takeout structure: Takeout/Mail/*.mbox)
    const mboxFiles: { name: string; entry: JSZip.JSZipObject }[] = [];
    const emlFiles: { name: string; entry: JSZip.JSZipObject }[] = [];

    zip.forEach((relativePath, entry) => {
      if (entry.dir) return;
      const lowerRel = relativePath.toLowerCase();
      if (lowerRel.includes('__macosx') || lowerRel.includes('.ds_store')) return;

      if (lowerRel.endsWith('.mbox')) {
        mboxFiles.push({ name: relativePath, entry });
      } else if (lowerRel.endsWith('.eml') || lowerRel.endsWith('.msg')) {
        emlFiles.push({ name: relativePath, entry });
      }
    });

    if (mboxFiles.length > 0) {
      archiveType = `Google Takeout / MBOX Archive (${mboxFiles.length} mbox file${mboxFiles.length > 1 ? 's' : ''})`;
      let fileIdx = 0;
      for (const mbox of mboxFiles) {
        fileIdx++;
        updateProgress(
          'extracting',
          `Extracting ${mbox.name.split('/').pop()} (${fileIdx}/${mboxFiles.length})...`,
          fileIdx,
          mboxFiles.length
        );
        const text = await mbox.entry.async('text');
        const chunks = splitMboxIntoMessages(text);
        rawMessages.push(...chunks);
      }
    } else if (emlFiles.length > 0) {
      archiveType = `EML Mail Archive (${emlFiles.length} files)`;
      let emlIdx = 0;
      for (const eml of emlFiles) {
        emlIdx++;
        if (emlIdx % 25 === 0 || emlIdx === emlFiles.length) {
          updateProgress(
            'extracting',
            `Extracting message ${emlIdx} of ${emlFiles.length}...`,
            emlIdx,
            emlFiles.length
          );
        }
        const text = await eml.entry.async('text');
        if (text.trim()) {
          rawMessages.push(text);
        }
      }
    } else {
      throw new Error(
        'No valid email files found in ZIP. Supported contents: Google Takeout .mbox files or .eml files.'
      );
    }
  } else if (lowerName.endsWith('.mbox')) {
    archiveType = 'Direct MBOX File';
    updateProgress('extracting', 'Reading MBOX mailbox file...', 30, 100);
    const text = await file.text();
    const chunks = splitMboxIntoMessages(text);
    rawMessages.push(...chunks);
  } else if (lowerName.endsWith('.eml') || lowerName.endsWith('.msg')) {
    archiveType = 'Direct EML File';
    updateProgress('extracting', 'Reading EML message file...', 50, 100);
    const text = await file.text();
    rawMessages.push(text);
  } else {
    throw new Error('Unsupported file type. Please upload a .zip, .mbox, or .eml file.');
  }

  if (rawMessages.length === 0) {
    throw new Error('No readable email messages were extracted from the archive.');
  }

  // Parse RFC 822 MIME messages using PostalMime
  const parsedMessages: Message[] = [];
  const totalRaw = rawMessages.length;

  for (let i = 0; i < totalRaw; i++) {
    const raw = rawMessages[i];
    if (i % 10 === 0 || i === totalRaw - 1) {
      updateProgress('parsing', `Parsing email ${i + 1} of ${totalRaw}...`, i + 1, totalRaw);
    }

    try {
      const parsed = await PostalMime.parse(raw);
      const msgId = parsed.messageId || `<import-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}@unified.hub>`;
      const timestamp = parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString();

      const fromObj = {
        name: parsed.from?.name || (parsed.from?.address ? parsed.from.address.split('@')[0] : 'Unknown Sender'),
        address: parsed.from?.address || 'unknown@example.com',
      };

      const toList = (parsed.to && parsed.to.length > 0)
        ? parsed.to
            .filter((t) => Boolean(t.address))
            .map((t) => ({
              name: t.name || (t.address ? t.address.split('@')[0] : 'Recipient'),
              address: t.address || 'unknown@example.com',
            }))
        : [{ name: 'Recipient', address: 'me@example.com' }];

      const ccList = parsed.cc
        ? parsed.cc.map((c) => c.address).filter((a): a is string => Boolean(a))
        : undefined;
      const bccList = parsed.bcc
        ? parsed.bcc.map((b) => b.address).filter((a): a is string => Boolean(a))
        : undefined;

      const references = Array.isArray(parsed.references)
        ? parsed.references
        : (parsed.references ? [parsed.references] : undefined);

      const getAttSize = (content: any): string => {
        if (!content) return '1 KB';
        if (typeof content === 'string') return `${Math.max(1, Math.round(content.length / 1024))} KB`;
        if (typeof content === 'object' && 'byteLength' in content) {
          return `${Math.max(1, Math.round(content.byteLength / 1024))} KB`;
        }
        return '1 KB';
      };

      const convertContentToDataUrl = (
        content: any,
        mimeType: string
      ): { dataUrl?: string; contentBase64?: string } => {
        if (!content) return {};
        try {
          let bytes: Uint8Array | null = null;
          if (content instanceof Uint8Array) {
            bytes = content;
          } else if (content instanceof ArrayBuffer) {
            bytes = new Uint8Array(content);
          } else if (typeof content === 'string') {
            const encoded = encodeURIComponent(content);
            return {
              dataUrl: `data:${mimeType || 'text/plain'};charset=utf-8,${encoded}`,
            };
          }

          if (bytes) {
            let binary = '';
            const len = bytes.byteLength;
            const chunkSize = 8192;
            for (let b = 0; b < len; b += chunkSize) {
              const chunk = bytes.subarray(b, Math.min(b + chunkSize, len));
              binary += String.fromCharCode.apply(null, Array.from(chunk));
            }
            const b64 = btoa(binary);
            return {
              contentBase64: b64,
              dataUrl: `data:${mimeType || 'application/octet-stream'};base64,${b64}`,
            };
          }
        } catch (err) {
          console.warn('Failed to encode attachment binary:', err);
        }
        return {};
      };

      const attachments = (parsed.attachments || []).map((att) => {
        const mime = att.mimeType || 'application/octet-stream';
        const { dataUrl, contentBase64 } = convertContentToDataUrl(att.content, mime);
        return {
          name: att.filename || 'attachment',
          size: getAttSize(att.content),
          type: mime,
          dataUrl,
          contentBase64,
        };
      });

      parsedMessages.push({
        id: `msg-imp-${Date.now()}-${i}`,
        threadId: '', // Will be assigned during thread reconstruction
        inboxId,
        projectId,
        channel,
        inboxRole,
        from: fromObj,
        to: toList,
        cc: ccList,
        bcc: bccList,
        subject: parsed.subject || '(No Subject)',
        bodyText: parsed.text || (parsed.html ? parsed.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : ''),
        bodyHtml: parsed.html || undefined,
        timestamp,
        isOutgoing: false,
        messageId: msgId,
        inReplyTo: parsed.inReplyTo || undefined,
        references,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
    } catch (parseErr) {
      console.warn(`Skipped malformed email chunk ${i}:`, parseErr);
    }
  }

  if (parsedMessages.length === 0) {
    throw new Error('Failed to parse any valid emails from the archive.');
  }

  updateProgress('threading', 'Reconstructing conversation threads with Gmail threading logic...', parsedMessages.length, parsedMessages.length);

  // GMAIL THREADING IMPLEMENTATION
  // Sort all messages chronologically ascending
  parsedMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  class UnionFind {
    parent: number[];
    constructor(size: number) {
      this.parent = Array.from({ length: size }, (_, idx) => idx);
    }
    find(idx: number): number {
      if (this.parent[idx] === idx) return idx;
      return (this.parent[idx] = this.find(this.parent[idx]));
    }
    union(i: number, j: number) {
      const rootI = this.find(i);
      const rootJ = this.find(j);
      if (rootI !== rootJ) {
        this.parent[rootI] = rootJ;
      }
    }
  }

  const n = parsedMessages.length;
  const uf = new UnionFind(n);

  // 1. Index all Message-IDs
  const msgIdToIndex = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const rawMid = parsedMessages[i].messageId;
    if (rawMid) {
      const clean = rawMid.trim().replace(/^<|>$/g, '');
      msgIdToIndex.set(clean, i);
      msgIdToIndex.set(rawMid.trim(), i);
    }
  }

  // 2. Strict RFC 5256 Header Threading (In-Reply-To & References)
  for (let i = 0; i < n; i++) {
    const msg = parsedMessages[i];

    if (msg.inReplyTo) {
      const cleanReply = msg.inReplyTo.trim().replace(/^<|>$/g, '');
      if (msgIdToIndex.has(cleanReply)) {
        uf.union(i, msgIdToIndex.get(cleanReply)!);
      } else if (msgIdToIndex.has(msg.inReplyTo.trim())) {
        uf.union(i, msgIdToIndex.get(msg.inReplyTo.trim())!);
      }
    }

    if (msg.references && msg.references.length > 0) {
      for (let r = msg.references.length - 1; r >= 0; r--) {
        const ref = msg.references[r];
        const cleanRef = ref.trim().replace(/^<|>$/g, '');
        if (msgIdToIndex.has(cleanRef)) {
          uf.union(i, msgIdToIndex.get(cleanRef)!);
          break;
        } else if (msgIdToIndex.has(ref.trim())) {
          uf.union(i, msgIdToIndex.get(ref.trim())!);
          break;
        }
      }
    }
  }

  // 3. Subject-based Threading (Strictly for explicit replies/forwards with common participants)
  const replyPrefixRegex = /^(?:\s*(?:re|fwd|fw)(?:\[\d+\])?:\s*)+/i;

  for (let i = 0; i < n; i++) {
    const msg = parsedMessages[i];
    // If already joined to an earlier message via headers, do not search further
    if (uf.find(i) !== i) continue;

    // A message MUST have an explicit reply prefix (Re:, Fwd:) to thread by subject
    if (!replyPrefixRegex.test(msg.subject)) {
      continue;
    }

    const normSubj = normalizeSubject(msg.subject);
    if (!normSubj || normSubj === '(no subject)') {
      continue;
    }

    const msgTime = new Date(msg.timestamp).getTime();
    const msgEmails = new Set<string>();
    if (msg.from?.address) msgEmails.add(msg.from.address.toLowerCase());
    for (const t of msg.to) {
      if (t.address) msgEmails.add(t.address.toLowerCase());
    }

    // Find the most recent matching prior message within 30 days
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    for (let j = i - 1; j >= 0; j--) {
      const prior = parsedMessages[j];
      const priorNormSubj = normalizeSubject(prior.subject);
      if (priorNormSubj !== normSubj) continue;

      const priorTime = new Date(prior.timestamp).getTime();
      if (msgTime - priorTime > THIRTY_DAYS_MS || priorTime > msgTime) continue;

      let sharesEmail = false;
      if (prior.from?.address && msgEmails.has(prior.from.address.toLowerCase())) {
        sharesEmail = true;
      } else {
        for (const t of prior.to) {
          if (t.address && msgEmails.has(t.address.toLowerCase())) {
            sharesEmail = true;
            break;
          }
        }
      }

      if (sharesEmail) {
        uf.union(i, j);
        break;
      }
    }
  }

  // 4. Group into threads by disjoint set root
  const threadGroups = new Map<number, Message[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    const list = threadGroups.get(root) || [];
    list.push(parsedMessages[i]);
    threadGroups.set(root, list);
  }

  // Build Thread objects
  const threads: Thread[] = [];
  let threadCounter = 0;

  for (const [, msgs] of threadGroups.entries()) {
    threadCounter++;
    msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const threadId = `thread-imp-${Date.now()}-${threadCounter}-${Math.random().toString(36).slice(2, 7)}`;
    const latestMsg = msgs[msgs.length - 1];

    for (const m of msgs) {
      m.threadId = threadId;
    }

    const participantMap = new Map<string, { name: string; address: string }>();
    for (const m of msgs) {
      if (m.from?.address) {
        participantMap.set(m.from.address.toLowerCase(), { name: m.from.name || m.from.address, address: m.from.address });
      }
      for (const t of m.to) {
        if (t.address && !participantMap.has(t.address.toLowerCase())) {
          participantMap.set(t.address.toLowerCase(), { name: t.name || t.address, address: t.address });
        }
      }
    }

    const snippet = (latestMsg.bodyText || latestMsg.subject || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 150);

    threads.push({
      id: threadId,
      projectId,
      inboxId,
      channel,
      inboxRole,
      subject: msgs[0].subject || '(No Subject)',
      snippet,
      participants: Array.from(participantMap.values()),
      lastMessageTimestamp: latestMsg.timestamp,
      messageCount: msgs.length,
      isRead: true,
      isStarred: false,
      isArchived: false,
      tags: ['ARCHIVE', 'IMPORTED'],
      messages: msgs,
    });
  }

  threads.sort((a, b) => new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime());

  updateProgress('complete', `Prepared ${threads.length} threads (${parsedMessages.length} emails)!`, threads.length, threads.length);

  return {
    threads,
    totalMessages: parsedMessages.length,
    archiveType,
  };
}
