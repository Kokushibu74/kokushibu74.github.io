import assert from "node:assert/strict";
import { ADMIN_COMMANDS, PUBLIC_COMMANDS, getTelegramCommandMenu, normalizeTelegramCommand } from "../cloudflare/telegram-command-utils.mjs";

assert.equal(normalizeTelegramCommand("/start"), "/start");
assert.equal(normalizeTelegramCommand("/INFO@KokushibuBot"), "/info");
assert.equal(normalizeTelegramCommand("  /userhistory@KokushibuBot  42  2 "), "/userhistory");
assert.equal(normalizeTelegramCommand("hello"), "");
assert.equal(normalizeTelegramCommand(""), "");

const publicMenu = getTelegramCommandMenu(false);
const adminMenu = getTelegramCommandMenu(true);
assert.deepEqual(publicMenu.map(x => x.command), ["start", "menu", "help", "cmd"]);
assert(adminMenu.some(x => x.command === "info"), "admin command menu must include /info");
for (const command of ["details", "health", "errors", "logs", "history", "sources", "traffic", "report", "userid", "userinfo", "usersearch", "userstats", "userhistory", "userrename", "userlink", "userunlink", "userblock", "userunblock"]) {
  assert(adminMenu.some(x => x.command === command), "missing admin command: /" + command);
  assert(!publicMenu.some(x => x.command === command), "admin command leaked into public menu: /" + command);
}
for (const command of [...PUBLIC_COMMANDS, ...ADMIN_COMMANDS]) {
  assert(command.command.length >= 1 && command.command.length <= 32);
  assert(command.description.length <= 256);
}
console.log("Telegram command parsing and scoped command menus passed.");
