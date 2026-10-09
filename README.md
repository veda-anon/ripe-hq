# Ripe HQ

Founder dashboard for Ripe. Notion stays the source of truth; this app reads and writes it, sends clinic email from Gmail, and runs a daily agent.

## What's in it

| Page | What it does |
|---|---|
| **Today** | Top 3 tasks (late → due today → in progress → next up), supply pulse, agent button, this week's content |
| **Tasks** | Execution Tasks grouped by phase. Tick, change status or due date. Writes to Notion. |
| **Clinic outreach** | *Needs you*: agent-drafted follow-ups to approve. *New email*: compose (optionally Claude-drafted), send from Gmail, auto-log to Notion with a follow-up date. *Call queue*: mirrors your Notion Call Queue + Callbacks, with a call logger. *All clinics*: the whole list. |
| **Content** | Content Tracker as a board, plus today's posting rhythm from the roadmap |
| **Research inbox** | Paste research → Claude proposes concrete tasks → you approve → they land in Execution Tasks (research saved as a Notion page) |
| **Connections** | Status of every integration + run the agents manually |

## The daily agent (7:00am ET via Vercel Cron)

1. **Reply check.** Every clinic marked *Sent* / *No response* is checked in Gmail. A reply flips it to *Replied* in Notion.
2. **Follow-up drafts.** Clinics whose *Follow Up On* date has arrived get a threaded follow-up written as a **Gmail draft**. Nothing is sent without you. After two follow-ups with no reply, the row is marked *No response* and left alone.
3. **Calendar.** Tasks due in the next 7 days, follow-ups and callbacks become all-day "Ripe: …" events.
4. **Morning brief** emailed to you (and to `ASSISTANT_EMAIL` if set).
5. **Assistant doc.** A Google Doc, "Ripe HQ: Context for my assistants", is rewritten with your priorities and rules.

Steps 3 to 5 are how Instinct and Muse learn. Neither has a public API, but both read your Google account.

## Setup (about 20 minutes)

### 1. Deploy
Import this repo at vercel.com/new. Framework is auto-detected.

### 2. Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Where it comes from |
|---|---|
| `DASHBOARD_PASSWORD` | Make one up. Required; the app refuses to run without it. |
| `CRON_SECRET` | Any long random string. Vercel sends it to the cron route. |
| `NOTION_TOKEN` | notion.so/profile/integrations → New internal integration "Ripe HQ" → secret. Then in Notion, on **Execution Tasks**, **Confirmed NYC / NJ Outreach**, **Target Pipeline**, **Content Tracker** and the **Execution Roadmap** page: ••• → Connections → Ripe HQ. |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys. Used for follow-up drafts and research triage. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | See step 3. |
| `GOOGLE_REFRESH_TOKEN` | Your personal Gmail. See step 3. |
| `GOOGLE_REFRESH_TOKEN_RIPE` | Your ripe.care account. See step 3. |
| `SEND_FROM` | Optional. `ripe` or `personal`: the default "Send from" for new clinic emails. Defaults to `ripe` once it's connected. |
| `ASSISTANT_ACCOUNT` | Optional. `personal` or `ripe`: which account gets calendar events, the morning brief and the assistant doc. Pick the one Instinct and Muse are connected to. Default `personal`. |
| `APP_URL` | Your Vercel URL, e.g. `https://ripe-hq.vercel.app` |
| `WAITLIST_SHEET_ID` | The ID in the "Ripe Waitlist" Google Sheet URL (`/d/<this part>/edit`) |
| `SENDER_NAME` | Name on outgoing email. Default `Veda`. |
| `ASSISTANT_EMAIL` | Optional. Instinct's dedicated email address, so it gets the morning brief. |
| `FOLLOW_UP_DAYS` | Optional. Business days before a follow-up is due. Default 5. |
| `ANTHROPIC_MODEL` | Optional. Default `claude-sonnet-5-5`. |

### 3. Google (Gmail, Calendar, Drive, Sheets), two accounts

Ripe HQ works with your personal Gmail and ripe.care side by side:
- Replies are checked in **both** inboxes.
- Follow-ups go out from **whichever account sent the original**, in the same thread.
- New emails have a **Send from** picker.
- Calendar, brief and assistant doc go to `ASSISTANT_ACCOUNT`.

One Google Cloud project covers both accounts. Create it from either account.

1. console.cloud.google.com → new project "Ripe HQ".
2. APIs & Services → Library → enable **Gmail API**, **Google Calendar API**, **Google Drive API**, **Google Sheets API**.
3. OAuth consent screen → **External** (Internal would block your gmail.com account) → add both addresses as test users → then **Publish app** (set to "In production"). If you leave it in Testing, Google expires the refresh token every 7 days and the agent silently stops. You'll see an "unverified app" warning when you connect; that's expected for a personal app.
4. Credentials → Create OAuth client ID → Web application → Authorized redirect URI: `https://<your-app>/api/google/callback`.
5. Put the client ID and secret in Vercel and redeploy.
6. Open **Connections → Connect Personal Gmail**, sign in with vedapatel01@gmail.com, and paste the token into the variable the page names (`GOOGLE_REFRESH_TOKEN`).
7. Back on Connections → **Connect ripe.care**, sign in with your ripe.care address, and paste that token into `GOOGLE_REFRESH_TOKEN_RIPE`.
8. Redeploy once more. Both accounts should show green on Connections.

If ripe.care is a Google Workspace account, its admin console can block unverified third-party apps. If connecting ripe.care fails with an "access blocked" message, go to admin.google.com → Security → Access and data control → API controls → Manage third-party app access, and mark Ripe HQ as Trusted.

### 4. Test
Connections → **Run agents now**. You should get a brief in your inbox, "Ripe:" events on your calendar, and drafts for any due follow-ups.

## Local dev
```
cp .env.example .env.local   # fill in
npm install
npm run dev
```

## Notes
- Gmail scope is `gmail.modify` (read replies, write drafts, send). It can't delete your mail permanently.
- Drafts and sent mail get em dashes stripped, per house style.
- Cold email from a personal Gmail: keep volume low (tens per day, not hundreds). If outreach scales, move to a dedicated `@ripe.care` sending address.
