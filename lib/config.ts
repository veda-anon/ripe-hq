// Notion data source IDs (the "collection://" IDs). Override with env vars if a database moves.
export const DS = {
  tasks: process.env.NOTION_DS_TASKS ?? "3f23149e-b932-8102-bc3c-000b16543a6b", // Execution Tasks
  outreach: process.env.NOTION_DS_OUTREACH ?? "07528fca-e5b1-44eb-90fd-25a5a8672835", // Confirmed NYC / NJ Outreach
  pipeline: process.env.NOTION_DS_PIPELINE ?? "61c3fc2f-6662-46c6-820c-304a2ba37f1d", // Target Pipeline (call queue)
  content: process.env.NOTION_DS_CONTENT ?? "60f5ea11-832b-4c3a-b674-4b432cd77a48", // Content Tracker
};

export const TZ = "America/New_York";

export const env = {
  notionToken: process.env.NOTION_TOKEN,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
  password: process.env.DASHBOARD_PASSWORD,
  sessionSecret: process.env.SESSION_SECRET ?? process.env.DASHBOARD_PASSWORD ?? "",
  cronSecret: process.env.CRON_SECRET,
  appUrl: process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  // Waitlist sheet (the "Ripe Waitlist" Google Sheet that ripe.care writes to)
  waitlistSheetId: process.env.WAITLIST_SHEET_ID,
  // Optional: Instinct's dedicated email address. If set, the morning brief is also sent there.
  assistantEmail: process.env.ASSISTANT_EMAIL,
  // Google Doc the agents keep current so Instinct / Muse can read it. Created on first run if unset.
  contextDocId: process.env.CONTEXT_DOC_ID,
  // Days to wait before a follow-up is due after a send
  followUpDays: Number(process.env.FOLLOW_UP_DAYS ?? 5),
  senderName: process.env.SENDER_NAME ?? "Veda",
};

export const has = {
  notion: () => !!env.notionToken,
  google: () => !!(env.googleClientId && env.googleClientSecret && env.googleRefreshToken),
  claude: () => !!env.anthropicKey,
};
