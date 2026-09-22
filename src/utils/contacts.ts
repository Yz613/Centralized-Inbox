import { Thread, InboxAccount } from '../types';

export interface Contact {
  address: string;          // Normalized lowercase email / phone
  displayAddress: string;   // Clean formatted address
  name: string;             // Display name (e.g. "Marcus Vance")
  avatar?: string;          // Initials or custom avatar
  incomingCount: number;    // Messages received from this contact
  outgoingCount: number;    // Messages sent to this contact
  lastInteractedAt: string; // ISO timestamp of most recent communication
  projectIds: string[];     // Associated project IDs
  inboxIds: string[];       // Associated inbox IDs
  isSender: boolean;        // Whether this person sent an inbound email
  recentSubject?: string;   // Latest subject line for quick reference
}

const STORAGE_KEY_CONTACTS = 'projectinbox_contacts_v1';

/**
 * Normalizes an email or phone address by trimming and lowercasing.
 * If passed as "Name <email@domain.com>", extracts the email and name.
 */
export function parseAddress(raw: string): { address: string; name?: string } {
  if (!raw) return { address: '' };
  const angleMatch = raw.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angleMatch) {
    const name = angleMatch[1].trim().replace(/^["']|["']$/g, '');
    const address = angleMatch[2].trim().toLowerCase();
    return { address, name: name || undefined };
  }
  return { address: raw.trim().toLowerCase() };
}

/**
 * Derives initials (up to 2 uppercase letters) from a name or address.
 */
export function getInitials(name?: string, address?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (address) {
    const clean = address.replace(/^[^a-zA-Z0-9]+/, '');
    return clean.slice(0, 2).toUpperCase();
  }
  return '??';
}

/**
 * Generates a stable hue and Tailwind color pair for an avatar based on email/name.
 */
export function getAvatarColor(key: string): { bg: string; text: string } {
  const palette = [
    { bg: 'bg-blue-100 dark:bg-blue-950/60', text: 'text-blue-700 dark:text-blue-300' },
    { bg: 'bg-purple-100 dark:bg-purple-950/60', text: 'text-purple-700 dark:text-purple-300' },
    { bg: 'bg-emerald-100 dark:bg-emerald-950/60', text: 'text-emerald-700 dark:text-emerald-300' },
    { bg: 'bg-amber-100 dark:bg-amber-950/60', text: 'text-amber-800 dark:text-amber-300' },
    { bg: 'bg-rose-100 dark:bg-rose-950/60', text: 'text-rose-700 dark:text-rose-300' },
    { bg: 'bg-indigo-100 dark:bg-indigo-950/60', text: 'text-indigo-700 dark:text-indigo-300' },
    { bg: 'bg-cyan-100 dark:bg-cyan-950/60', text: 'text-cyan-700 dark:text-cyan-300' },
    { bg: 'bg-teal-100 dark:bg-teal-950/60', text: 'text-teal-700 dark:text-teal-300' },
  ];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

/**
 * Extracts and aggregates contacts across conversation threads and inboxes.
 */
export function extractContacts(threads: Thread[], inboxes: InboxAccount[] = []): Contact[] {
  const map = new Map<string, Contact>();
  const ownEmailSet = new Set(inboxes.map((i) => i.email.toLowerCase()));

  // Process all threads
  for (const thread of threads) {
    const threadTimestamp = thread.lastMessageTimestamp || new Date().toISOString();

    // 1. Process thread-level participants
    if (Array.isArray(thread.participants)) {
      for (const p of thread.participants) {
        if (!p.address) continue;
        const norm = p.address.trim().toLowerCase();
        if (ownEmailSet.has(norm)) continue; // Don't index user's own inbound mailboxes as external contacts

        const existing = map.get(norm);
        if (!existing) {
          map.set(norm, {
            address: norm,
            displayAddress: p.address.trim(),
            name: p.name?.trim() || norm.split('@')[0],
            avatar: p.avatar || getInitials(p.name, p.address),
            incomingCount: 0,
            outgoingCount: 0,
            lastInteractedAt: threadTimestamp,
            projectIds: thread.projectId ? [thread.projectId] : [],
            inboxIds: thread.inboxId ? [thread.inboxId] : [],
            isSender: false,
            recentSubject: thread.subject,
          });
        } else {
          if (p.name && (!existing.name || existing.name === norm.split('@')[0])) {
            existing.name = p.name.trim();
            existing.avatar = p.avatar || getInitials(existing.name, existing.address);
          }
          if (new Date(threadTimestamp).getTime() > new Date(existing.lastInteractedAt).getTime()) {
            existing.lastInteractedAt = threadTimestamp;
            existing.recentSubject = thread.subject;
          }
          if (thread.projectId && !existing.projectIds.includes(thread.projectId)) {
            existing.projectIds.push(thread.projectId);
          }
          if (thread.inboxId && !existing.inboxIds.includes(thread.inboxId)) {
            existing.inboxIds.push(thread.inboxId);
          }
        }
      }
    }

    // 2. Process all messages for precise sender vs recipient tracking
    if (Array.isArray(thread.messages)) {
      for (const msg of thread.messages) {
        const msgTimestamp = msg.timestamp || threadTimestamp;

        // Inbound message: msg.from is a person who emailed the user
        if (!msg.isOutgoing && msg.from?.address) {
          const norm = msg.from.address.trim().toLowerCase();
          if (!ownEmailSet.has(norm)) {
            let contact = map.get(norm);
            if (!contact) {
              contact = {
                address: norm,
                displayAddress: msg.from.address.trim(),
                name: msg.from.name?.trim() || norm.split('@')[0],
                avatar: msg.from.avatar || getInitials(msg.from.name, msg.from.address),
                incomingCount: 1,
                outgoingCount: 0,
                lastInteractedAt: msgTimestamp,
                projectIds: msg.projectId ? [msg.projectId] : thread.projectId ? [thread.projectId] : [],
                inboxIds: msg.inboxId ? [msg.inboxId] : thread.inboxId ? [thread.inboxId] : [],
                isSender: true,
                recentSubject: msg.subject || thread.subject,
              };
              map.set(norm, contact);
            } else {
              contact.incomingCount += 1;
              contact.isSender = true;
              if (msg.from.name && (!contact.name || contact.name === norm.split('@')[0])) {
                contact.name = msg.from.name.trim();
                contact.avatar = msg.from.avatar || getInitials(contact.name, contact.address);
              }
              if (new Date(msgTimestamp).getTime() > new Date(contact.lastInteractedAt).getTime()) {
                contact.lastInteractedAt = msgTimestamp;
                contact.recentSubject = msg.subject || thread.subject;
              }
              const pId = msg.projectId || thread.projectId;
              if (pId && !contact.projectIds.includes(pId)) contact.projectIds.push(pId);
              const iId = msg.inboxId || thread.inboxId;
              if (iId && !contact.inboxIds.includes(iId)) contact.inboxIds.push(iId);
            }
          }
        }

        // Outbound message: msg.to are recipients
        if (Array.isArray(msg.to)) {
          for (const recipient of msg.to) {
            if (!recipient.address) continue;
            const norm = recipient.address.trim().toLowerCase();
            if (ownEmailSet.has(norm)) continue;

            let contact = map.get(norm);
            if (!contact) {
              contact = {
                address: norm,
                displayAddress: recipient.address.trim(),
                name: recipient.name?.trim() || norm.split('@')[0],
                avatar: getInitials(recipient.name, recipient.address),
                incomingCount: 0,
                outgoingCount: 1,
                lastInteractedAt: msgTimestamp,
                projectIds: msg.projectId ? [msg.projectId] : thread.projectId ? [thread.projectId] : [],
                inboxIds: msg.inboxId ? [msg.inboxId] : thread.inboxId ? [thread.inboxId] : [],
                isSender: false,
                recentSubject: msg.subject || thread.subject,
              };
              map.set(norm, contact);
            } else {
              contact.outgoingCount += 1;
              if (recipient.name && (!contact.name || contact.name === norm.split('@')[0])) {
                contact.name = recipient.name.trim();
                contact.avatar = getInitials(contact.name, contact.address);
              }
              if (new Date(msgTimestamp).getTime() > new Date(contact.lastInteractedAt).getTime()) {
                contact.lastInteractedAt = msgTimestamp;
                contact.recentSubject = msg.subject || thread.subject;
              }
            }
          }
        }

        // CC recipients
        if (Array.isArray(msg.cc)) {
          for (const ccRaw of msg.cc) {
            const parsed = parseAddress(ccRaw);
            if (!parsed.address || ownEmailSet.has(parsed.address)) continue;
            let contact = map.get(parsed.address);
            if (!contact) {
              map.set(parsed.address, {
                address: parsed.address,
                displayAddress: parsed.address,
                name: parsed.name || parsed.address.split('@')[0],
                avatar: getInitials(parsed.name, parsed.address),
                incomingCount: 0,
                outgoingCount: 0,
                lastInteractedAt: msgTimestamp,
                projectIds: msg.projectId ? [msg.projectId] : thread.projectId ? [thread.projectId] : [],
                inboxIds: msg.inboxId ? [msg.inboxId] : thread.inboxId ? [thread.inboxId] : [],
                isSender: false,
                recentSubject: msg.subject || thread.subject,
              });
            }
          }
        }
      }
    }
  }

  // Also include team inboxes as optional secondary suggestions (so users can email colleagues)
  for (const inbox of inboxes) {
    const norm = inbox.email.toLowerCase();
    if (!map.has(norm)) {
      map.set(norm, {
        address: norm,
        displayAddress: inbox.email,
        name: inbox.name || norm.split('@')[0],
        avatar: getInitials(inbox.name, inbox.email),
        incomingCount: 0,
        outgoingCount: 0,
        lastInteractedAt: inbox.lastSyncedAt || new Date().toISOString(),
        projectIds: [inbox.projectId],
        inboxIds: [inbox.id],
        isSender: false,
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Searches and ranks contacts based on query, inbound sender status, recency, and project relevance.
 */
export function searchContacts(
  contacts: Contact[],
  query: string,
  options?: {
    currentProjectId?: string;
    limit?: number;
    excludeAddresses?: string[];
  }
): Contact[] {
  const limit = options?.limit ?? 8;
  const currentProjectId = options?.currentProjectId;
  const excludeSet = new Set((options?.excludeAddresses || []).map((a) => a.toLowerCase().trim()));

  const available = contacts.filter((c) => !excludeSet.has(c.address.toLowerCase()));
  const q = query.trim().toLowerCase();

  // Zero-query: return top recent contacts (prioritizing people who sent emails to user)
  if (!q) {
    return available
      .slice()
      .sort((a, b) => {
        // Inbound senders come first
        if (a.isSender !== b.isSender) return a.isSender ? -1 : 1;
        // Same project first
        if (currentProjectId) {
          const aProj = a.projectIds.includes(currentProjectId);
          const bProj = b.projectIds.includes(currentProjectId);
          if (aProj !== bProj) return aProj ? -1 : 1;
        }
        // Most recent first
        return new Date(b.lastInteractedAt).getTime() - new Date(a.lastInteractedAt).getTime();
      })
      .slice(0, limit);
  }

  // Scored query matching
  interface ScoredContact {
    contact: Contact;
    score: number;
  }

  const scored: ScoredContact[] = [];

  for (const contact of available) {
    const addr = contact.address.toLowerCase();
    const name = contact.name.toLowerCase();
    const [localPart, domain] = addr.split('@');

    let matchScore = 0;

    if (addr === q) {
      matchScore = 1000; // Exact email match
    } else if (name === q) {
      matchScore = 950; // Exact name match
    } else if (addr.startsWith(q)) {
      matchScore = 850; // Email starts with query
    } else if (name.startsWith(q)) {
      matchScore = 800; // Name starts with query
    } else if (localPart && localPart.startsWith(q)) {
      matchScore = 750; // Local part starts with query
    } else {
      // Check if any word in the name starts with query (e.g. "Vance" for "va")
      const words = name.split(/[\s,.-]+/);
      if (words.some((w) => w.startsWith(q))) {
        matchScore = 700;
      } else if (name.includes(q)) {
        matchScore = 600; // Name contains query
      } else if (addr.includes(q)) {
        matchScore = 500; // Address contains query
      } else if (domain && domain.includes(q)) {
        matchScore = 400; // Domain matches
      }
    }

    if (matchScore > 0) {
      // Bonus: Inbound sender bonus (+150 pts) - directly fulfills "I'm getting emails from people. I should be able to email them back"
      if (contact.isSender) {
        matchScore += 150;
      }

      // Bonus: Current project context (+60 pts)
      if (currentProjectId && contact.projectIds.includes(currentProjectId)) {
        matchScore += 60;
      }

      // Bonus: Frequency of interaction (+ up to 30 pts)
      matchScore += Math.min(30, (contact.incomingCount * 5) + (contact.outgoingCount * 2));

      // Bonus: Recency (+ up to 30 pts for emails in the past month)
      const daysAgo = (Date.now() - new Date(contact.lastInteractedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysAgo <= 1) matchScore += 30;
      else if (daysAgo <= 7) matchScore += 20;
      else if (daysAgo <= 30) matchScore += 10;

      scored.push({ contact, score: matchScore });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.contact);
}

/**
 * Saves extracted contacts to localStorage for quick restore.
 */
export function saveContactsToStorage(contacts: Contact[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CONTACTS, JSON.stringify(contacts));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Loads contacts from localStorage.
 */
export function loadContactsFromStorage(): Contact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONTACTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
