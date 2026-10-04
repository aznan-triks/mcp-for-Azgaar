// Plain JavaScript on purpose: it must run on a Node too old to run the TypeScript server, to say so clearly.
export const MIN_NODE = { major: 22, minor: 18 }; // first 22.x that runs .ts files without a flag
export const PREFERRED_NODE_MAJOR = 24; // Azgaar itself asks for 24

export function parseNode(version = process.versions.node) {
  const [major, minor] = version.split(".").map(Number);
  return { major, minor };
}

export function isSupportedNode(version = process.versions.node) {
  const { major, minor } = parseNode(version);
  return major > MIN_NODE.major || (major === MIN_NODE.major && minor >= MIN_NODE.minor);
}

export function unsupportedNodeMessage(version = process.versions.node) {
  return `Node ${version} is too old: this server needs Node ${MIN_NODE.major}.${MIN_NODE.minor} or newer (${PREFERRED_NODE_MAJOR} recommended). Install it from https://nodejs.org, then restart your AI client.`;
}
