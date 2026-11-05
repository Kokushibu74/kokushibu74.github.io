import assert from "node:assert/strict";
import { ADMIN_COMMANDS, PUBLIC_COMMANDS, getTelegramCommandMenu, normalizeTelegramCommand, parseTelegramCommand } from "../cloudflare/telegram-command-utils.mjs";
import { readFileSync } from "node:fs";

const cases = [
  ["/start", { command: "/start", args: [] }],
  ["/INFO@KokushibuBot", { command: "/info", args: [] }],
  ["  /userhistory@KokushibuBot  42  2 ", { command: "/userhistory", args: ["42", "2"] }],
  ["/userhistory 42 2", { command: "/userhistory", args: ["42", "2"] }],
  ["/userid 3", { command: "/userid", args: ["3"] }],
  ["/usersearch New York City", { command: "/usersearch", args: ["New", "York", "City"] }],
  ["/GA4@KokushibuBot", { command: "/ga4", args: [] }],
  ["hello", { command: "", args: [] }],
  ["", { command: "", args: [] }],
  ["//start", { command: "", args: [] }],
  ["/bad-command", { command: "", args: [] }],
  ["/thiscommandnameislongerthanthirtytwocharacters", { command: "", args: [] }]
];
for (const [input, expected] of cases) {
  assert.deepEqual(parseTelegramCommand(input), expected, "parse command: " + input);
  assert.equal(normalizeTelegramCommand(input), expected.command, "normalize command: " + input);
}

const publicMenu = getTelegramCommandMenu(false);
const adminMenu = getTelegramCommandMenu(true);
assert.deepEqual(publicMenu.map(x => x.command), ["start", "menu", "help", "cmd"]);
assert(adminMenu.some(x => x.command === "info"), "admin command menu must include /info");
assert(adminMenu.some(x => x.command === "ga4"), "admin command menu must include /ga4");
for (const command of ["details", "health", "ga4", "errors", "logs", "history", "sources", "traffic", "report", "userid", "userinfo", "usersearch", "userstats", "userhistory", "userrename", "userlink", "userunlink", "userblock", "userunblock"]) {
  assert(adminMenu.some(x => x.command === command), "missing admin command: /" + command);
  assert(!publicMenu.some(x => x.command === command), "admin command leaked into public menu: /" + command);
}
for (const command of [...PUBLIC_COMMANDS, ...ADMIN_COMMANDS]) {
  assert(command.command.length >= 1 && command.command.length <= 32);
  assert(command.description.length <= 256);
}
assert.equal(new Set(adminMenu.map(x => x.command)).size, adminMenu.length, "Telegram command menu must not contain duplicates");
assert(adminMenu.length <= 100, "Telegram command menu must remain within Telegram's limit");

const worker = readFileSync(new URL("../cloudflare/portfolio-contact-telegram.js", import.meta.url), "utf8");
assert(worker.includes("parseTelegramCommand(text)"), "Worker must use the tested argument-aware command parser");
assert(worker.includes("UM_CONFIRM_PREFIX"), "State-changing User Manager commands must use expiring confirmations");
assert(worker.includes("newsAlerts"), "News Alerts must be exposed in the Automation settings");
assert(worker.includes('action.startsWith("command:")'), "Inline report actions must route to the command handler");
assert(worker.includes("users:profile:telegram:"), "Telegram directory entries must open their profile");
assert(worker.includes('if(cmd==="/ga4")'), "Worker must route the GA4 command");
console.log("Telegram command parsing, argument handling and scoped command menus passed.");
