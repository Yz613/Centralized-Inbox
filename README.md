# ProjectInbox — Unified Multi-Project Mail Hub

**ProjectInbox** is a private, self-hosted unified inbox built for makers, businesses, and professionals managing communication across multiple brands and projects. The default stack is **free**: Cloudflare Email Routing inbound + Gmail Sign-In outbound.

Protected by a secure password gate running at Cloudflare edge with Cloudflare D1 persistence.

---

## Key Features

- **Multi-Project Workspaces**: Partition inboxes and email threads by project/brand (e.g. SaaS, E-Commerce, Advisory).
- **Multi-Provider Sync**:
  - **Cloudflare Direct Email Routing**: Receive incoming emails for custom domains 100% free via Cloudflare Email Workers.
  - **Gmail (free outbound)**: Sign in with Google. Replies from Cloudflare inboxes send through Gmail with Reply-To set to your custom address.
  - **Zoho Mail**: Optional IMAP if you already have it. Paid Zoho SMTP is not required.
  - **Email Archive Importer**: Drag-and-drop `.zip`, `.mbox`, or `.eml` archives to restore historical conversations.
- **Password Gate Protection**: Powered by an edge HMAC-signed HttpOnly session cookie (`__inbox_auth`) with rate limiting and secure redirect handling.
- **AI Smart Replies & Executive Briefing**: Powered by Google Gemini 2.5 Flash for instant tone-adapted email drafts and project status summaries.
- **RFC Threading & Real Attachments**: Collapsible reply composer, CC/BCC, real file attach on send, and direct binary attachment downloads.
- **Operator speed**: Command palette (`⌘K`), saved replies, snooze, and search across message bodies.

---

## Architecture

- **Frontend**: React 19, Tailwind CSS, Lucide Icons, Vite
- **Backend & Edge**: Cloudflare Workers (Hono framework)
- **Database**: Cloudflare D1 (Serverless SQLite at the edge)
- **Email Engines**: PostalMime (inbound edge parsing), ImapFlow (IMAP sync), Nodemailer (SMTP dispatch)

---

## Quickstart: Deploy Your Own Instance

Anyone can fork or clone this repository and deploy their own private ProjectInbox on their own Cloudflare account with their own custom password and domains.

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/Yz613/Centralized-Inbox.git
cd Centralized-Inbox
npm install
```

### 2. Create Your Own Cloudflare D1 Database

Log in to Cloudflare and create a new D1 database:

```bash
npx wrangler login
npx wrangler d1 create centralized-inbox-db
```

Wrangler will output your unique `database_id`:
```
database_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 3. Update `wrangler.jsonc`

Open [`wrangler.jsonc`](./wrangler.jsonc) and paste your `database_id`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "centralized-inbox-db",
    "database_id": "PASTE_YOUR_DATABASE_ID_HERE"
  }
],
"vars": {
  "ENVIRONMENT": "production",
  // Optional: enter your personal email if you want copies of incoming customer emails forwarded:
  "FORWARD_EMAIL": "your-personal-email@gmail.com"
}
```

### 4. Apply Database Migrations

Initialize your D1 database schema:

```bash
# Apply schema to your live Cloudflare D1 database
npm run d1:migrate
```

### 5. Set Your Passwords & Secrets

Configure your custom password gate and secrets using Wrangler:

```bash
# 1. Set the password you want to use to log into your inbox:
npx wrangler secret put GATE_PASSWORD

# 2. Set a random 32+ character session signing secret:
npx wrangler secret put SESSION_SECRET

# 3. (Optional) Set your Google Gemini API key for AI Smart Replies:
# Get a key at https://aistudio.google.com/app/apikey
npx wrangler secret put GEMINI_API_KEY
```

### 6. Build & Deploy

Build the frontend and deploy the worker to Cloudflare:

```bash
npm run deploy
```

Your live site URL will be displayed in the terminal:
`https://centralized-inbox.<your-subdomain>.workers.dev`

---

## Local Development

To run ProjectInbox on your local machine:

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Start local dev server
npm run dev
```

Visit `http://localhost:3000` in your browser.

---

## How Authentication & Password Management Works

1. **Self-Hosted Privacy**: Each instance is single-tenant and runs inside your own Cloudflare account. Your emails, passwords, and tokens are stored in your private D1 database and never shared with anyone else.
2. **Password Gate**: When you visit your deployed site, the Cloudflare Worker intercepts all requests. If unauthenticated, it presents the **Sign in — ProjectInbox** page.
3. **Session Cookies**: Upon entering your `GATE_PASSWORD`, an HMAC SHA-256 session token is signed using your `SESSION_SECRET` and saved as an HttpOnly, Secure, Lax cookie (`__inbox_auth`).
4. **Log Out**: Clicking **Log out** clears all client-side storage (`localStorage`, `sessionStorage`, and Firebase session state) and performs a full-page navigation to `/logout`. The Cloudflare Worker clears the HttpOnly cookie and redirects to `/login`.
5. **Changing Your Password**: To update your password at any time, run:
   ```bash
   npx wrangler secret put GATE_PASSWORD
   ```
   All existing sessions will immediately require re-authentication.

---

## Setting Up Your Mailboxes

### Option A: Cloudflare Email Routing (Free Custom Domains)
1. In Cloudflare Dashboard, go to your domain &gt; **Email Routing** &gt; **Email Workers**.
2. Add a rule routing your address (e.g. `contact@yourdomain.com` or Catch-All `*@yourdomain.com`) to Worker: `centralized-inbox`.
3. In ProjectInbox, open **Accounts** &gt; **Connect Account** &gt; **Cloudflare Direct**. Enter your address. All inbound emails will stream live into your unified feed.
4. Sign in with Gmail in the same screen. Replies send through Gmail with Reply-To set to your custom address. Do not buy Zoho SMTP.

### Option B: Gmail / Google Workspace (Free send)
1. In ProjectInbox, open **Accounts** &gt; **Connect Account** &gt; **Gmail** and use **Google Sign-In**.
2. Optional: a Gmail App Password also works and is free.

### Option C: Zoho Mail (optional IMAP you already have)
Paid Zoho SMTP is not required. If you already have a Zoho App Password, IMAP sync still works.

---

## License

MIT License. Free for personal and commercial use.
