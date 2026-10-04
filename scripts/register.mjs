// Registers the MCP server with Claude Desktop and prints the Claude Code command.
//   npm run register                 prints both (changes nothing)
//   npm run register -- --desktop    adds/updates the entry in Claude Desktop's config (backup first)
//   npm run register -- --remove     removes that entry
//   --config <file>                  use another Claude Desktop config file; --name <name>  use another entry name
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_NAME = "azgaar";

export function desktopConfigPath(platform = process.platform, env = process.env, home = homedir()) {
  if (platform === "win32") return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  if (platform === "darwin") return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "Claude", "claude_desktop_config.json");
}

/** Absolute paths on purpose: Claude Desktop often does not see the user's PATH, so a bare `node` can fail. */
export function serverEntry(nodePath = process.execPath, rootDir = root) {
  return { command: nodePath, args: [join(rootDir, "scripts", "start.mjs")] };
}

const quote = s => (/[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
export function claudeCodeCommand(name = DEFAULT_NAME, entry = serverEntry()) {
  return `claude mcp add ${name} -- ${[entry.command, ...entry.args].map(quote).join(" ")}`;
}

/** Adds, updates or removes the entry. Never overwrites a config it cannot parse. Returns what happened. */
export function patchDesktopConfig(file, { name = DEFAULT_NAME, entry = serverEntry(), remove = false } = {}) {
  let config = {};
  let backup = null;
  if (existsSync(file)) {
    const raw = readFileSync(file, "utf8");
    try {
      config = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`${file} is not valid JSON: fix or delete it, nothing was changed.`);
    }
    if (typeof config !== "object" || config === null || Array.isArray(config)) throw new Error(`${file} does not hold a JSON object: nothing was changed.`);
    backup = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(file, backup);
  } else {
    mkdirSync(dirname(file), { recursive: true });
  }
  config.mcpServers ??= {};
  const had = name in config.mcpServers;
  if (remove) delete config.mcpServers[name];
  else config.mcpServers[name] = entry;
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return { file, backup, action: remove ? (had ? "removed" : "absent") : had ? "updated" : "added" };
}

function main(argv) {
  const opt = k => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const name = opt("--name") ?? DEFAULT_NAME;
  const entry = serverEntry();
  const file = opt("--config") ?? desktopConfigPath();
  if (argv.includes("--desktop") || argv.includes("--remove")) {
    const r = patchDesktopConfig(file, { name, entry, remove: argv.includes("--remove") });
    console.log(`Claude Desktop config ${r.action}: ${r.file}${r.backup ? `\n(backup: ${r.backup})` : ""}\nRestart Claude Desktop for it to take effect.`);
    return;
  }
  console.log(`Claude Code (run once):\n  ${claudeCodeCommand(name, entry)}\n`);
  console.log(`Claude Desktop (automatic): npm run register -- --desktop\n  edits ${file}\n  entry: ${JSON.stringify({ [name]: entry })}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
