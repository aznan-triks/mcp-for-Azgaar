// Entry point used by AI clients: checks Node first (the server itself is TypeScript and needs a recent Node), then starts it.
import { isSupportedNode, unsupportedNodeMessage } from "./node-version.mjs";

if (!isSupportedNode()) {
  process.stderr.write(`[fmg-mcp] ${unsupportedNodeMessage()}\n`);
  process.exit(1);
}
await import("../server/index.ts");
