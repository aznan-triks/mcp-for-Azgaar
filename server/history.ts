import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MapSession } from "./browser.ts";

export interface Entry {
  id: number;
  label: string;
  file: string;
  at: string;
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "step";
}

/** Undo/redo as exact .map snapshots on disk (the format Azgaar itself saves and loads). */
export class History {
  private readonly dir: string;
  private readonly max: number;
  private readonly session: MapSession;
  private past: Entry[] = [];
  private future: Entry[] = [];
  private counter = 0;

  constructor(dir: string, max: number, session: MapSession) {
    this.dir = dir;
    this.max = max;
    this.session = session;
    this.reset();
  }

  /** Forgets everything (startup, new map). */
  reset(): void {
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    this.past = [];
    this.future = [];
  }

  private async snapshot(label: string): Promise<Entry> {
    const text = await this.session.call<string>("exportMap");
    this.counter += 1;
    const entry: Entry = { id: this.counter, label, file: join(this.dir, `${String(this.counter).padStart(4, "0")}-${slug(label)}.map`), at: new Date().toISOString() };
    writeFileSync(entry.file, text);
    return entry;
  }

  private forget(entry: Entry): void {
    rmSync(entry.file, { force: true });
  }

  /** Call right before a change: saves the current map so the change can be undone. */
  async pushBefore(label: string): Promise<void> {
    for (const e of this.future) this.forget(e);
    this.future = [];
    this.past.push(await this.snapshot(label));
    while (this.past.length > this.max) this.forget(this.past.shift() as Entry);
  }

  /** True when the map now is the same as the snapshot taken before the change (nothing happened). */
  async lastSnapshotMatchesCurrent(): Promise<boolean> {
    const last = this.past.at(-1);
    if (!last) return false;
    return readFileSync(last.file, "utf8") === (await this.session.call<string>("exportMap"));
  }

  /** The change failed or changed nothing: drop the snapshot taken for it. */
  dropLast(): void {
    const last = this.past.pop();
    if (last) this.forget(last);
  }

  /** The change failed midway: put the map back exactly as it was before it, and forget the snapshot. */
  async rollback(): Promise<void> {
    const last = this.past.pop();
    if (!last) return;
    try {
      await this.restore(last);
    } finally {
      this.forget(last);
    }
  }

  private async restore(entry: Entry): Promise<void> {
    await this.session.call("importMap", readFileSync(entry.file, "utf8"), true); // same geography: keep selections
  }

  async undo(): Promise<Entry> {
    const entry = this.past.pop();
    if (!entry) throw new Error("Nothing to undo");
    this.future.push(await this.snapshot(entry.label));
    await this.restore(entry);
    this.forget(entry);
    return entry;
  }

  async redo(): Promise<Entry> {
    const entry = this.future.pop();
    if (!entry) throw new Error("Nothing to redo");
    this.past.push(await this.snapshot(entry.label));
    await this.restore(entry);
    this.forget(entry);
    return entry;
  }

  state(): { undoable: string[]; redoable: string[] } {
    return { undoable: this.past.map(e => e.label).reverse(), redoable: this.future.map(e => e.label).reverse() };
  }
}
