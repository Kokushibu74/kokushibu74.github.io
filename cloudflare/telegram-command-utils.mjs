export const PUBLIC_COMMANDS = [
  { command: "start", description: "Open the bot welcome and control menu" },
  { command: "menu", description: "Open the main menu" },
  { command: "help", description: "Show command help" },
  { command: "cmd", description: "Show all available commands" }
];

export const ADMIN_COMMANDS = [
  { command: "info", description: "Website and Worker health report" },
  { command: "details", description: "Show details for the current menu section" },
  { command: "health", description: "Quick website and Worker health check" },
  { command: "ga4", description: "Google Analytics 4 report for today and yesterday" },
  { command: "errors", description: "Show recorded error and failure events" },
  { command: "logs", description: "Show recent recorded activity" },
  { command: "history", description: "Show a selected user's history: /history ID [page]" },
  { command: "sources", description: "Show News Feed source breakdown" },
  { command: "traffic", description: "Show Cloudflare visitor traffic summary" },
  { command: "report", description: "Show the daily visitor report" },
  { command: "userid", description: "List Telegram users and website visitors" },
  { command: "userinfo", description: "Show a user profile: /userinfo ID" },
  { command: "usersearch", description: "Search users: /usersearch TEXT" },
  { command: "userstats", description: "Show user management statistics" },
  { command: "userhistory", description: "Show user events: /userhistory ID [page]" },
  { command: "userrename", description: "Set a custom user ID: /userrename ID CUSTOM" },
  { command: "userlink", description: "Link Telegram and website IDs" },
  { command: "userunlink", description: "Unlink a user identity" },
  { command: "userblock", description: "Block a user: /userblock ID [scope]" },
  { command: "userunblock", description: "Unblock a user: /userunblock ID [scope]" }
];

export function parseTelegramCommand(text) {
  const value = String(text || "").trim();
  if (!value.startsWith("/")) return { command: "", args: [] };
  const [token, ...args] = value.split(/\s+/);
  const command = String(token || "").split("@", 1)[0].toLowerCase();
  if (!/^\/[a-z0-9_]{1,32}$/.test(command)) return { command: "", args: [] };
  return { command, args };
}

export function normalizeTelegramCommand(text) {
  return parseTelegramCommand(text).command;
}

export function getTelegramCommandMenu(isAdmin) {
  return isAdmin ? [...PUBLIC_COMMANDS, ...ADMIN_COMMANDS] : [...PUBLIC_COMMANDS];
}
