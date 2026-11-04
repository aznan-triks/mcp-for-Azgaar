import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import type { Config } from "./config.ts";
import { uniqueFile } from "./files.ts";

export interface OpenOptions {
  seed?: string | null;
  width?: number;
  height?: number;
}

type AgentWindow = { FMG_AGENT: Record<string, (...args: unknown[]) => unknown> };

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]); // const-ok: loopback host names are protocol constants

const BLOCKED_REQUESTS_KEPT = 200; // const-ok: how many refused outside addresses map_status remembers

const PROFILE_LOCK_FILES = ["SingletonLock", "SingletonCookie", "SingletonSocket"]; // const-ok: file names fixed by Chromium

/**
 * A browser killed brutally leaves its profile lock behind and the next launch refuses to start (D-007).
 * On Linux/macOS the lock is a link named "<host>-<pid>": when that process is gone the lock is stale and removed.
 * On Windows the lock is held open by a live process, so nothing is removed (see profileLockHint).
 */
export function releaseStaleProfileLock(profileDir: string): boolean {
  const lock = join(profileDir, PROFILE_LOCK_FILES[0] as string);
  let target: string;
  try {
    if (!lstatSync(lock).isSymbolicLink()) return false;
    target = readlinkSync(lock);
  } catch {
    return false; // no lock, or not a link (Windows): nothing to judge
  }
  const pid = Number(/-(\d+)$/.exec(target)?.[1]);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0); // signal 0 = existence check only
    return false; // the owner is alive: the lock is real
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EPERM") return false; // alive, owned by someone else
  }
  for (const name of PROFILE_LOCK_FILES) rmSync(join(profileDir, name), { force: true });
  return true;
}

/** Turns Chromium's cryptic "ProcessSingleton" failure into something a person can act on. */
export function profileLockHint(profileDir: string, message: string): string | null {
  if (!/ProcessSingleton|SingletonLock|profile.*(in use|locked)/i.test(message)) return null;
  return `The browser profile (${profileDir}) is used by another browser window or by a browser left running in the background after a crash. Close that window or end the leftover Chrome/Edge process in the task manager, then retry. To run two servers at once, give each its own FMG_PROFILE_DIR.`;
}

/** Owns the visible browser window that shows the map and runs the in-page bridge. */
export class MapSession {
  private readonly cfg: Config;
  readonly baseUrl: string;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private launching: Promise<Page> | null = null;
  readonly blockedRequests = new Set<string>();
  readonly pageErrors: string[] = [];
  /** Problems met while starting that did not stop the session (e.g. an autosave that could not be restored). */
  readonly startupWarnings: string[] = [];
  /** Runs after each browser launch once the map is ready (restores the autosave). */
  afterLaunch: (() => Promise<void>) | null = null;

  constructor(cfg: Config, baseUrl: string) {
    this.cfg = cfg;
    this.baseUrl = baseUrl;
  }

  private urlFor(opts: OpenOptions): string {
    const params = new URLSearchParams();
    const seed = opts.seed ?? this.cfg.map.seed;
    if (seed) params.set("seed", seed);
    params.set("width", String(opts.width ?? this.cfg.map.width));
    params.set("height", String(opts.height ?? this.cfg.map.height));
    return `${this.baseUrl}/?${params.toString()}`;
  }

  /** Returns a ready page, (re)launching the browser if it was never opened or the user closed it. */
  async ensure(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    this.launching ??= this.launch().finally(() => {
      this.launching = null;
    });
    return await this.launching;
  }

  /** Channel actually used by the running browser (null when an executable path is configured). */
  usedChannel: string | null = null;

  private async launchContext(): Promise<BrowserContext> {
    const { browser } = this.cfg;
    mkdirSync(this.cfg.profileDir, { recursive: true });
    if (releaseStaleProfileLock(this.cfg.profileDir)) this.startupWarnings.push("A stale browser profile lock (left by a crashed browser) was removed.");
    const base = { headless: browser.headless, viewport: browser.viewport, deviceScaleFactor: 1, serviceWorkers: "block" as const, args: browser.args };
    if (browser.executablePath) {
      this.usedChannel = null;
      try {
        return await chromium.launchPersistentContext(this.cfg.profileDir, { ...base, executablePath: browser.executablePath });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const hint = profileLockHint(this.cfg.profileDir, message);
        throw hint ? new Error(`${hint}\n(original error: ${message.split("\n")[0]})`) : err;
      }
    }
    const channels = [browser.channel, ...browser.fallbackChannels].filter((c): c is string => Boolean(c));
    const notFound: string[] = [];
    for (const channel of channels) {
      try {
        const context = await chromium.launchPersistentContext(this.cfg.profileDir, { ...base, channel });
        this.usedChannel = channel;
        return context;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!/is not found|Executable doesn't exist|distribution/i.test(message)) {
          const hint = profileLockHint(this.cfg.profileDir, message);
          throw hint ? new Error(`${hint}\n(original error: ${message.split("\n")[0]})`) : err; // a real failure: do not mask it
        }
        notFound.push(channel);
      }
    }
    throw new Error(
      `No browser found (tried: ${notFound.join(", ") || "none configured"}). Install Google Chrome or Microsoft Edge, or set browser.executablePath (or browser.channel) in config/fmg-mcp.json.`
    );
  }

  /**
   * Azgaar greets a first launch with a release-notes window and a tooltip. Pre-filling its local storage before the
   * page runs keeps them off the map the AI and the person are looking at. Existing values are never overwritten.
   */
  private async seedBrowserStorage(): Promise<void> {
    const seed: Record<string, string> = { ...this.cfg.browser.seedStorage };
    if (existsSync(this.cfg.azgaarPackage)) {
      const { version } = JSON.parse(readFileSync(this.cfg.azgaarPackage, "utf8")) as { version?: string };
      if (version) seed.version = version; // the key Azgaar compares with its own version
    }
    await this.context?.addInitScript(entries => {
      try {
        for (const [key, value] of Object.entries(entries)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
      } catch {
        /* storage unavailable: nothing to seed */
      }
    }, seed);
  }

  private async launch(): Promise<Page> {
    // The person may have closed the tab but not the browser: release the profile before starting again.
    await this.context?.close().catch(() => undefined);
    this.context = await this.launchContext();
    await this.seedBrowserStorage();
    // 100 % local: anything that is not the local server is refused and recorded.
    await this.context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.protocol === "data:" || url.protocol === "blob:" || LOCAL_HOSTS.has(url.hostname)) return route.continue();
      this.blockedRequests.add(`${url.origin}${url.pathname}`);
      // Keep the newest addresses only: a page that keeps calling out must not grow this list for weeks.
      if (this.blockedRequests.size > BLOCKED_REQUESTS_KEPT) this.blockedRequests.delete(this.blockedRequests.values().next().value as string);
      return route.abort();
    });
    this.context.on("close", () => {
      this.page = null;
      this.context = null;
    });
    const page = this.context.pages()[0] ?? (await this.context.newPage());
    page.on("pageerror", e => this.pageErrors.push(e.message));
    page.on("dialog", d => void d.dismiss());
    this.page = page;
    await this.load(page, {});
    try {
      await this.afterLaunch?.();
    } catch (err) {
      this.startupWarnings.push(`could not restore the previous map, a new one was generated: ${err instanceof Error ? err.message : String(err)}`);
    }
    return page;
  }

  private async load(page: Page, opts: OpenOptions): Promise<void> {
    await page.goto(this.urlFor(opts));
    await page.waitForFunction(() => (window as unknown as AgentWindow).FMG_AGENT?.isReady(), null, { timeout: this.cfg.browser.readyTimeoutMs });
    await page.evaluate(cfg => (window as unknown as AgentWindow).FMG_AGENT.configure(cfg), this.cfg.bridge);
  }

  /** Saves a file produced by Azgaar's download menu to the configured exports folder. */
  async captureDownload(trigger: () => Promise<unknown>, fileName?: string): Promise<{ file: string; bytes: number; suggestedName: string }> {
    const page = await this.ensure();
    mkdirSync(this.cfg.exportsDir, { recursive: true });
    const waiting = page.waitForEvent("download", { timeout: this.cfg.limits.exportTimeoutMs });
    waiting.catch(() => undefined); // consume a late timeout if the trigger itself throws
    await trigger();
    const download = await waiting.catch(() => {
      throw new Error("Azgaar did not produce a file (nothing was downloaded). Check the browser window and try again.");
    });
    const suggestedName = download.suggestedFilename();
    const ext = extname(suggestedName);
    const wanted = (fileName ?? basename(suggestedName, ext)).replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\.\.+/g, ".") || "export";
    const file = uniqueFile(this.cfg.exportsDir, wanted, ext);
    await download.saveAs(file);
    return { file, bytes: statSync(file).size, suggestedName };
  }

  /** Set a file input without relying on an interactive native file picker. */
  async setInputFile(selector: string, path: string): Promise<void> {
    const page = await this.ensure();
    await page.setInputFiles(selector, path, { timeout: this.cfg.limits.exportTimeoutMs });
  }

  /** Upload through a button that opens the native picker. Start listening before clicking it. */
  async uploadViaPicker(trigger: () => Promise<unknown>, path: string): Promise<void> {
    const page = await this.ensure();
    const waiting = page.waitForEvent("filechooser", { timeout: this.cfg.limits.exportTimeoutMs });
    waiting.catch(() => undefined);
    await trigger();
    await (await waiting).setFiles(path);
  }

  /** Generates a fresh map (reloads the page with new parameters). */
  async openNew(opts: OpenOptions): Promise<void> {
    const page = await this.ensure();
    await this.load(page, opts);
  }

  /** Calls window.FMG_AGENT[method](...args) in the page and returns its JSON-able result. */
  async call<T>(method: string, ...args: unknown[]): Promise<T> {
    const page = await this.ensure();
    try {
      return (await page.evaluate(([m, a]) => (window as unknown as AgentWindow).FMG_AGENT[m as string](...(a as unknown[])), [method, args] as const)) as T;
    } catch (err) {
      throw new Error(cleanError(err));
    }
  }

  /**
   * PNG keeps map text sharp; if it is heavier than the limit (view.maxImageBytes, or `maxBytes` for this call),
   * the same view is sent as JPEG instead. `format` overrides view.format for this call.
   */
  async screenshot(opts: { format?: "png" | "jpeg"; maxBytes?: number } = {}): Promise<{ data: Buffer; mimeType: string }> {
    const page = await this.ensure();
    const { jpegQuality, maxImageBytes } = this.cfg.view;
    const format = opts.format ?? this.cfg.view.format;
    const maxBytes = opts.maxBytes ?? maxImageBytes;
    if (format === "png") {
      const png = await page.screenshot({ type: "png" });
      if (png.length <= maxBytes) return { data: png, mimeType: "image/png" };
    }
    return { data: await page.screenshot({ type: "jpeg", quality: jpegQuality }), mimeType: "image/jpeg" };
  }

  /** The browser window size in CSS pixels. */
  viewportSize(): { width: number; height: number } {
    return this.page?.viewportSize() ?? this.cfg.browser.viewport;
  }

  /** Captures the window at `scale` times its pixel size (vector map: more pixels, same framing). No size limit applied. */
  async captureScaled(scale: number, format: "png" | "jpeg", jpegQuality: number): Promise<Buffer> {
    const page = await this.ensure();
    const { width, height } = this.viewportSize();
    const cdp = await page.context().newCDPSession(page);
    try {
      const shot = await cdp.send("Page.captureScreenshot", {
        format,
        ...(format === "jpeg" ? { quality: jpegQuality } : {}),
        clip: { x: 0, y: 0, width, height, scale }
      });
      return Buffer.from(shot.data, "base64");
    } finally {
      await cdp.detach().catch(() => undefined);
    }
  }

  /** Opt-in vector screenshot at a higher scale, filtered in the same page by FMG_AGENT.
   * Default (supersample=1) is the original CDP path, byte-for-byte unchanged. */
  async captureFiltered(
    scale: number, format: "png" | "jpeg", jpegQuality: number,
    width: number, height: number, supersample: number,
    filter: "lanczos3" | "stepdown" | "fast"
  ): Promise<{ data: Buffer; downsampleMs: number }> {
    if (supersample === 1) return { data: await this.captureScaled(scale, format, jpegQuality), downsampleMs: 0 };
    const sourceWidth = Math.round(this.viewportSize().width * scale * supersample);
    const sourceHeight = Math.round(this.viewportSize().height * scale * supersample);
    if (Math.max(sourceWidth, sourceHeight) > this.cfg.export.maxSourcePixels)
      throw new Error(`Supersampled source ${sourceWidth}x${sourceHeight} exceeds export.maxSourcePixels (${this.cfg.export.maxSourcePixels})`);
    const raw = await this.captureScaled(scale * supersample, "png", jpegQuality);
    const filtered = await this.call<{ base64: string; width: number; height: number; downsampleMs: number }>(
      "downsampleImage", { base64: raw.toString("base64"), mimeType: `image/${format}`, width, height, filter, quality: jpegQuality / 100 }
    );
    if (filtered.width !== width || filtered.height !== height)
      throw new Error("The browser returned the wrong filtered image dimensions");
    return { data: Buffer.from(filtered.base64, "base64"), downsampleMs: filtered.downsampleMs };
  }

  /** True while a browser window exists (background jobs must never reopen one the person closed). */
  isOpen(): boolean {
    return this.page !== null && !this.page.isClosed();
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = null;
    this.page = null;
  }
}

/** Playwright wraps in-page errors with a prefix and a stack: keep only the message meant for the AI. */
export function cleanError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const first = message.split("\n")[0] ?? message;
  return first.replace(/^page\.evaluate:\s*/, "").replace(/^(AgentError|Error):\s*/, "");
}
