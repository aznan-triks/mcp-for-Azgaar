import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Autosave, restoreOnLaunch } from "./autosave.ts";
import { MapSession } from "./browser.ts";
import { loadConfig } from "./config.ts";
import { History } from "./history.ts";
import { Exclusive } from "./queue.ts";
import { startStaticServer } from "./static.ts";
import { registerTools, SERVER_INSTRUCTIONS } from "./tools.ts";

const MS_PER_SECOND = 1e3; // const-ok: unit conversion

// Never write to stdout: it carries the MCP protocol. Logs go to stderr.
const log = (message: string) => process.stderr.write(`[fmg-mcp] ${message}\n`);

const cfg = loadConfig();
const web = await startStaticServer(cfg.azgaarDist, cfg.server.host, cfg.server.port);
const session = new MapSession(cfg, web.url);
const history = new History(join(cfg.mapsDir, "history"), cfg.history.maxEntries, session);
const { version } = JSON.parse(readFileSync(join(cfg.root, "package.json"), "utf8")) as { version: string };

const server = new McpServer({ name: "azgaar", version }, { instructions: SERVER_INSTRUCTIONS });
const exclusive = new Exclusive();
const autosave = new Autosave(join(cfg.mapsDir, "autosave.map"), session);
restoreOnLaunch(session, autosave, cfg.startup === "autosave", log);
registerTools(server, cfg, session, history, exclusive, autosave);

let closing = false;
let timer: NodeJS.Timeout | null = null;
async function shutdown(code: number): Promise<void> {
  if (closing) return;
  closing = true;
  if (timer) clearInterval(timer);
  try {
    // Last save, so that manual edits made in the window since the previous save are not lost.
    if (session.isOpen()) await exclusive.run(() => autosave.write());
  } catch (err) {
    log(`final autosave failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  await session.close();
  await web.close();
  process.exit(code);
}
process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));
process.stdin.on("close", () => void shutdown(0));

await server.connect(new StdioServerTransport());
log(`serving Azgaar at ${web.url}`);

void (async () => {
  try {
    // Inside the shared queue: the periodic autosave must never run while the browser is still
    // launching, or it would overwrite the autosave with the freshly generated (not yet restored) map.
    await exclusive.run(() => session.ensure());
    log("browser ready");
  } catch (err) {
    log(`browser failed to start: ${err instanceof Error ? err.message : String(err)}`);
  }
})();

// Periodic save: also captures changes the person makes by hand in the window, not only the AI's edits.
if (cfg.autosave.intervalSec > 0) {
  timer = setInterval(() => {
    if (closing || !session.isOpen()) return;
    exclusive
      .run(async () => {
        if (session.isOpen() && (await autosave.write())) log("autosaved");
      })
      .catch(err => log(`autosave failed: ${err instanceof Error ? err.message : String(err)}`));
  }, cfg.autosave.intervalSec * MS_PER_SECOND);
  timer.unref();
}
