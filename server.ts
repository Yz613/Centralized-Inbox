import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialized Gemini client
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// AI Smart Reply Generation
app.post('/api/ai/smart-reply', async (req, res) => {
  try {
    const {
      threadSubject,
      latestMessage,
      senderName,
      inboxEmail,
      inboxRole,
      channel,
      tone,
      userInstructions,
    } = req.body;

    const ai = getGenAI();
    if (!ai) {
      // High quality fallback templates if API key is not configured yet
      const fallbackReplies: Record<string, string> = {
        support: `Hello ${senderName || 'there'},\n\nThank you for reaching out to our support team. We have received your message regarding "${threadSubject || 'your inquiry'}" and are actively looking into it.\n\nCould you please confirm if this is still occurring on your end? We'll follow up shortly with a resolution.\n\nBest regards,\nSupport Team (${inboxEmail})`,
        admin: `Hi ${senderName || 'there'},\n\nThank you for the update. I have reviewed the details for "${threadSubject || 'this item'}" and approved the requested changes.\n\nPlease let me know if any further documentation or sign-off is needed from our side.\n\nRegards,\nOperations & Admin (${inboxEmail})`,
        notifications: `Acknowledged. The alert for "${threadSubject || 'System Alert'}" has been noted and assigned for verification.\n\n-- Automated acknowledgment from ${inboxEmail}`,
        general: `Hi ${senderName || 'there'},\n\nThanks for reaching out! Regarding "${threadSubject || 'your message'}", we've received your note and will get back to you with next steps shortly.\n\nBest,\n${inboxEmail}`,
      };

      const fallbackText = fallbackReplies[inboxRole] || fallbackReplies.general;
      return res.json({
        reply: fallbackText,
        source: 'template_fallback',
        suggestions: [
          'Thanks for the update, will check immediately.',
          'Acknowledged, our team is on it.',
          'Could you provide additional logs/details?',
        ],
      });
    }

    const prompt = `You are assisting an email/message user replying to an incoming message in a project unified inbox.
Originating Inbox Account: ${inboxEmail} (${channel} - Role: ${inboxRole})
Thread Subject: ${threadSubject || 'No Subject'}
Sender: ${senderName || 'Sender'}
Incoming Message Body:
"""
${latestMessage || ''}
"""

Tone requested: ${tone || 'professional, concise, and helpful'}
Additional user guidance: ${userInstructions || 'Address the issue directly and offer clear next steps.'}

Instructions:
1. Generate an appropriate, polished draft reply written from the perspective of "${inboxEmail}".
2. Adapt tone to the inbox role:
   - If "support": empathetic, solution-oriented, clear.
   - If "admin": decisive, clear, polite.
   - If "notifications": short acknowledgement or triage note.
   - If chat (WhatsApp/Instagram): natural conversational brevity.
3. Provide 3 short one-line quick-reply options as well.
4. Output strict JSON with format:
{
  "reply": "The complete draft reply text...",
  "suggestions": ["Quick option 1", "Quick option 2", "Quick option 3"]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        reply: text,
        suggestions: ['Sounds good!', 'Please clarify.', 'Received, thank you.'],
      };
    }

    return res.json(parsed);
  } catch (error: any) {
    console.error('Error generating smart reply:', error);
    res.status(500).json({
      error: 'Failed to generate smart reply',
      details: error?.message,
    });
  }
});

// AI Project Summary
app.post('/api/ai/project-summary', async (req, res) => {
  try {
    const { projectName, inboxes, threads } = req.body;

    const ai = getGenAI();
    if (!ai) {
      return res.json({
        summary: `Summary for ${projectName}: Currently monitoring ${inboxes?.length || 0} inboxes. Total active threads: ${threads?.length || 0}. Key priorities include addressing pending customer support inquiries and reviewing administrative alerts.`,
        actionItems: [
          'Review unread support tickets',
          'Acknowledge administrative payout/audit updates',
          'Follow up on active client conversation threads',
        ],
      });
    }

    const threadSnippets = (threads || [])
      .slice(0, 10)
      .map(
        (t: any, idx: number) =>
          `[${idx + 1}] Inbox: ${t.inboxEmail} (${t.channel} / ${t.inboxRole}) | Subject: ${t.subject} | Status: ${t.isRead ? 'Read' : 'UNREAD'} | Snippet: ${t.snippet}`
      )
      .join('\n');

    const prompt = `You are a productivity executive assistant in a Unified Multi-Inbox Hub.
Project Name: "${projectName}"
Connected Inboxes: ${(inboxes || []).map((i: any) => `${i.name} (${i.email} [${i.type}])`).join(', ')}

Recent Inbound & Outbound Threads:
${threadSnippets}

Instructions:
Provide a concise, executive briefing of this project's inbox status:
1. High-level summary of what is happening across these inboxes (max 3 sentences).
2. Bulleted list of 3-4 concrete Action Items that require user attention.
3. Urgent item identification (if any).

Output strict JSON:
{
  "summary": "...",
  "actionItems": ["...", "..."],
  "urgentAlert": "..." (or null if none)
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        summary: text,
        actionItems: ['Check recent unread emails', 'Review pending replies'],
      };
    }

    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in project summary:', error);
    res.status(500).json({
      error: 'Failed to generate project summary',
      details: error?.message,
    });
  }
});

// Test/Verify Inbox connection
app.post('/api/inbox/test-connection', (req, res) => {
  const { type, email, host, port } = req.body;
  // Simulate immediate handshake verification
  setTimeout(() => {
    res.json({
      success: true,
      type,
      email,
      status: 'authenticated',
      serverLatencyMs: 84,
      lastSyncTimestamp: new Date().toISOString(),
      folderCount: 5,
    });
  }, 400);
});

async function startServer() {
  // Vite middleware in dev, static files in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
