import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";

const MAP_SUFFIX = /\.map$/i;
const BYTES_PER_MB = 1e6; // const-ok: unit conversion for messages

const megabytes = (bytes: number): string => (bytes / BYTES_PER_MB).toFixed(1);

/**
 * Reads a .map file for `map_file load`. The caller already checked the name ends in .map; this refuses what the name
 * hides: a link that points at some other file, anything that is not a regular file (a device or a pipe would block
 * or fill the memory), and a file too big to be a map. The absolute-path feature itself stays: people keep maps outside `maps/`.
 */
export function readMapFile(file: string, maxBytes: number): string {
  const real = realpathSync(file); // follows links; also fails here, before anything is touched, if the file is missing
  if (!MAP_SUFFIX.test(real)) throw new Error(`map_file load: ${file} is a link to a file that is not a .map file`);
  const info = statSync(real);
  if (!info.isFile()) throw new Error(`map_file load: ${file} is not a regular file`);
  if (info.size > maxBytes) throw new Error(`map_file load: ${file} is ${megabytes(info.size)} MB, over the ${megabytes(maxBytes)} MB limit (limits.mapFileBytesMax)`);
  return readFileSync(real, "utf8");
}

/**
 * A file name in `dir` that does not exist yet: `<wanted><ext>`, else `<wanted>-<time><ext>`, else the same with a
 * counter, so that exports made within the same millisecond never overwrite each other.
 */
export function uniqueFile(dir: string, wanted: string, ext: string, exists: (path: string) => boolean = existsSync, now: () => number = Date.now): string {
  let file = join(dir, `${wanted}${ext}`);
  if (!exists(file)) return file;
  file = join(dir, `${wanted}-${now()}${ext}`);
  for (let n = 2; exists(file); n += 1) file = join(dir, `${wanted}-${now()}-${n}${ext}`);
  return file;
}
