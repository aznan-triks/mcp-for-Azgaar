import { config } from "./config";
import { cellAt, mapSize, round, visibleBounds } from "./geometry";
import { AgentError, type Params } from "./types";

const STATE_CHARS = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const OTHER_STATE = "#";
const UNCLAIMED = ".";
const SEA = "~";
const LAKE = "o";
const CAPITAL = "*";

function dimension(args: Params, key: "cols" | "rows", fallback: number): number {
  const value = args[key] ?? fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 8 || value > config.textMapMax)
    throw new AgentError(`textMap: ${key} must be a whole number between 8 and ${config.textMapMax}`);
  return value;
}

/**
 * The visible part of the map as characters, for AI models that cannot look at images.
 * One character per sample: a digit/letter = the state (see `key`), `.` unclaimed land, `~` sea, `o` lake, `*` a capital.
 */
export function textMap(args: Params): Record<string, unknown> {
  const cols = dimension(args, "cols", config.textMapCols);
  const rows = dimension(args, "rows", config.textMapRows);
  const b = visibleBounds();
  const { width, height } = mapSize();
  const capitals = new Set<number>();
  for (const s of pack.states) if (s.i && !s.removed && s.capital) capitals.add(pack.burgs[s.capital]?.cell);
  const used = new Set<number>();
  const charOf = (state: number): string => (state <= STATE_CHARS.length ? STATE_CHARS[state - 1] : OTHER_STATE);
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const y = Math.min(height, Math.max(0, b.y0 + ((r + 0.5) * (b.y1 - b.y0)) / rows));
    let line = "";
    for (let c = 0; c < cols; c++) {
      const x = Math.min(width, Math.max(0, b.x0 + ((c + 0.5) * (b.x1 - b.x0)) / cols));
      const cell = cellAt(x, y);
      if (pack.cells.h[cell] < 20) line += pack.features[pack.cells.f[cell]]?.type === "lake" ? LAKE : SEA;
      else if (capitals.has(cell)) line += CAPITAL;
      else if (!pack.cells.state[cell]) line += UNCLAIMED;
      else {
        used.add(pack.cells.state[cell]);
        line += charOf(pack.cells.state[cell]);
      }
    }
    lines.push(line);
  }
  const key: Record<string, string> = {};
  for (const id of [...used].sort((a, z) => a - z)) {
    const name = pack.states[id]?.fullName ?? pack.states[id]?.name ?? `state ${id}`;
    key[charOf(id)] = key[charOf(id)] ? `${key[charOf(id)]}, ${name} (${id})` : `${name} (${id})`;
  }
  return {
    rows: lines,
    key,
    symbols: { [SEA]: "sea", [LAKE]: "lake", [UNCLAIMED]: "land without a state", [CAPITAL]: "a capital city" },
    area: { x0: round(b.x0), y0: round(b.y0), x1: round(b.x1), y1: round(b.y1) },
    cellSizeInMapUnits: { x: round((b.x1 - b.x0) / cols), y: round((b.y1 - b.y0) / rows) }
  };
}
