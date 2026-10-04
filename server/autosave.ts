import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { MapSession } from "./browser.ts";

/** Keeps `maps/autosave.map` equal to what is on screen, and puts it back when the browser (re)starts. */
export class Autosave {
  readonly file: string;
  private readonly session: MapSession;
  private lastWritten: string | null = null;

  constructor(file: string, session: MapSession) {
    this.file = file;
    this.session = session;
  }

  /** Writes the current map. Returns false when nothing changed since the last write. */
  async write(): Promise<boolean> {
    const text = await this.session.call<string>("exportMap");
    if (text === this.lastWritten) return false;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, this.file); // a crash mid-write must never leave a half-written autosave
    this.lastWritten = text;
    return true;
  }

  /** Loads the autosave into the browser if there is one. Returns true when it did. */
  async restore(): Promise<boolean> {
    if (!existsSync(this.file)) return false;
    const text = readFileSync(this.file, "utf8");
    await this.session.call("importMap", text);
    this.lastWritten = text;
    return true;
  }
}

/** Every time the browser (re)opens, even after the person closed the window, the last saved map comes back. */
export function restoreOnLaunch(session: MapSession, autosave: Autosave, enabled: boolean, log: (message: string) => void): void {
  session.afterLaunch = async () => {
    if (enabled && (await autosave.restore())) log("restored the autosaved map");
  };
}
