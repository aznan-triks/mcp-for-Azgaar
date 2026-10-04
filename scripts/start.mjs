// Entry point used by AI clients: checks Node and the install first, then starts the server (TypeScript, needs a recent Node).
import { existsSync } from "node:fs";
import { distIndex } from "./azgaar.mjs";
import { isSupportedNode, unsupportedNodeMessage } from "./node-version.mjs";

if (!isSupportedNode()) {
  process.stderr.write(`[azgaar] ${unsupportedNodeMessage()}\n`);
  process.exit(1);
}
if (!existsSync(distIndex)) {
  process.stderr.write("[azgaar] Azgaar is not installed yet: double-click install.bat (or run `npm run setup`), then restart your AI client.\n");
  process.exit(1);
}
await import("../server/index.ts");
