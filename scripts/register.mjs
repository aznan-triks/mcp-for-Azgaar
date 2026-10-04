// Connects the server to your AI client. Works with any client that speaks MCP over stdio.
//   npm run register                              prints ready-to-paste settings for every supported client (changes nothing)
//   npm run register -- --client cline --write    writes the entry into that client's settings file (backup first)
//   npm run register -- --desktop                 same as: --client desktop --write   (Claude Desktop)
//   --text-only    for AI models that cannot look at images: the map is described in characters instead of screenshots
//   --remove       removes the entry instead      --name <name>  use another entry name      --config <file>  use another settings file
//   --list         lists the client names accepted by --client
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_NAME = "azgaar";

const appData = (env, home) => env.APPDATA ?? join(home, "AppData", "Roaming");
const xdg = (env, home) => env.XDG_CONFIG_HOME ?? join(home, ".config");

export function desktopConfigPath(platform = process.platform, env = process.env, home = homedir()) {
  if (platform === "win32") return join(appData(env, home), "Claude", "claude_desktop_config.json");
  if (platform === "darwin") return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  return join(xdg(env, home), "Claude", "claude_desktop_config.json");
}

/** Clients whose settings are a JSON file we can edit safely. `key` is the object that holds the servers. */
export const JSON_CLIENTS = {
  desktop: { label: "Claude Desktop", key: "mcpServers", file: desktopConfigPath },
  cline: {
    label: "Cline (VS Code)",
    key: "mcpServers",
    file: (platform, env, home) => {
      const tail = join("Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json");
      if (platform === "win32") return join(appData(env, home), tail);
      if (platform === "darwin") return join(home, "Library", "Application Support", tail);
      return join(xdg(env, home), tail);
    }
  },
  cursor: { label: "Cursor", key: "mcpServers", file: (_p, _e, home) => join(home, ".cursor", "mcp.json") },
  gemini: { label: "Gemini CLI", key: "mcpServers", file: (_p, _e, home) => join(home, ".gemini", "settings.json") },
  lmstudio: { label: "LM Studio", key: "mcpServers", file: (_p, _e, home) => join(home, ".lmstudio", "mcp.json") },
  zed: {
    label: "Zed",
    key: "context_servers",
    file: (platform, env, home) => (platform === "win32" ? join(appData(env, home), "Zed", "settings.json") : join(xdg(env, home), "zed", "settings.json"))
  }
};

/** Absolute paths on purpose: many clients do not see the user's PATH, so a bare `node` can fail. */
export function serverEntry(nodePath = process.execPath, rootDir = root, { textOnly = false } = {}) {
  const entry = { command: nodePath, args: [join(rootDir, "scripts", "start.mjs")] };
  if (textOnly) entry.env = { FMG_TEXT_ONLY: "1" };
  return entry;
}

const quote = s => (/[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
export function claudeCodeCommand(name = DEFAULT_NAME, entry = serverEntry()) {
  const env = Object.entries(entry.env ?? {}).map(([k, v]) => `--env ${k}=${quote(v)} `).join("");
  return `claude mcp add ${env}${name} -- ${[entry.command, ...entry.args].map(quote).join(" ")}`;
}

/** Adds, updates or removes the entry. Never overwrites a file it cannot parse. Returns what happened. */
export function patchDesktopConfig(file, { name = DEFAULT_NAME, entry = serverEntry(), remove = false, key = "mcpServers" } = {}) {
  let config = {};
  let backup = null;
  if (existsSync(file)) {
    const raw = readFileSync(file, "utf8");
    try {
      config = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`${file} is not plain JSON (comments are not allowed by this tool): add the entry by hand, nothing was changed.`);
    }
    if (typeof config !== "object" || config === null || Array.isArray(config)) throw new Error(`${file} does not hold a JSON object: nothing was changed.`);
    backup = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(file, backup);
  } else {
    mkdirSync(dirname(file), { recursive: true });
  }
  config[key] ??= {};
  const had = name in config[key];
  if (remove) delete config[key][name];
  else config[key][name] = entry;
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return { file, backup, action: remove ? (had ? "removed" : "absent") : had ? "updated" : "added" };
}

const tomlString = s => JSON.stringify(s); // JSON strings are valid TOML basic strings
const yamlString = s => JSON.stringify(s); // and valid YAML double-quoted scalars

export function codexToml(name, entry) {
  const lines = [`[mcp_servers.${name}]`, `command = ${tomlString(entry.command)}`, `args = [${entry.args.map(tomlString).join(", ")}]`];
  if (entry.env) lines.push(`env = { ${Object.entries(entry.env).map(([k, v]) => `${k} = ${tomlString(v)}`).join(", ")} }`);
  return lines.join("\n");
}

export function hermesYaml(name, entry) {
  const lines = ["mcp_servers:", `  ${name}:`, `    command: ${yamlString(entry.command)}`, "    args:", ...entry.args.map(a => `      - ${yamlString(a)}`)];
  if (entry.env) lines.push("    env:", ...Object.entries(entry.env).map(([k, v]) => `      ${k}: ${yamlString(v)}`));
  return lines.join("\n");
}

export function continueYaml(name, entry) {
  const lines = ["mcpServers:", `  - name: ${name}`, `    command: ${yamlString(entry.command)}`, "    args:", ...entry.args.map(a => `      - ${yamlString(a)}`)];
  if (entry.env) lines.push("    env:", ...Object.entries(entry.env).map(([k, v]) => `      ${k}: ${yamlString(v)}`));
  return lines.join("\n");
}

function printAll(name, entry) {
  const jsonSnippet = key => JSON.stringify({ [key]: { [name]: entry } }, null, 2);
  const out = [];
  out.push("Pick YOUR AI program below and paste its block. Easiest: let this tool write it for you:  npm run register -- --client <name> --write\n");
  out.push(`Claude Code (run once):\n  ${claudeCodeCommand(name, entry)}\n`);
  for (const [id, c] of Object.entries(JSON_CLIENTS)) {
    out.push(`${c.label}  (automatic: npm run register -- --client ${id} --write)\n  file: ${c.file(process.platform, process.env, homedir())}\n${jsonSnippet(c.key).replace(/^/gm, "  ")}\n`);
  }
  out.push(`OpenAI Codex CLI\n  file: ${join(homedir(), ".codex", "config.toml")}\n${codexToml(name, entry).replace(/^/gm, "  ")}\n`);
  out.push(`Hermes Agent (Nous Research)\n  file: ${join(homedir(), ".hermes", "config.yaml")}\n${hermesYaml(name, entry).replace(/^/gm, "  ")}\n`);
  out.push(`Continue.dev\n  file: ${join(homedir(), ".continue", "config.yaml")}\n${continueYaml(name, entry).replace(/^/gm, "  ")}\n`);
  out.push("Any other MCP client: give it a local \"stdio\" server with this command and arguments:");
  out.push(`  command: ${entry.command}\n  arguments: ${entry.args.join(" ")}${entry.env ? `\n  environment: ${Object.entries(entry.env).map(([k, v]) => `${k}=${v}`).join(" ")}` : ""}`);
  out.push("\nIf your AI model cannot look at images (most small local models, some DeepSeek models), add --text-only: the map is then described in characters.");
  console.log(out.join("\n"));
}

function main(argv) {
  const opt = k => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const name = opt("--name") ?? DEFAULT_NAME;
  const entry = serverEntry(process.execPath, root, { textOnly: argv.includes("--text-only") });
  if (argv.includes("--list")) {
    console.log(Object.entries(JSON_CLIENTS).map(([id, c]) => `${id}  (${c.label})`).join("\n"));
    return;
  }
  const legacyDesktop = argv.includes("--desktop");
  const clientId = legacyDesktop ? "desktop" : opt("--client");
  if (clientId || argv.includes("--remove")) {
    const id = clientId ?? "desktop";
    const client = JSON_CLIENTS[id];
    if (!client) throw new Error(`Unknown client "${id}". Use one of: ${Object.keys(JSON_CLIENTS).join(", ")} (others: see npm run register, copy the block by hand).`);
    if (!legacyDesktop && !argv.includes("--write") && !argv.includes("--remove")) throw new Error("Add --write to really change the file (nothing was changed).");
    const file = opt("--config") ?? client.file(process.platform, process.env, homedir());
    const r = patchDesktopConfig(file, { name, entry, remove: argv.includes("--remove"), key: client.key });
    console.log(`${client.label} settings ${r.action}: ${r.file}${r.backup ? `\n(backup: ${r.backup})` : ""}\nRestart ${client.label} for it to take effect.`);
    return;
  }
  printAll(name, entry);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
