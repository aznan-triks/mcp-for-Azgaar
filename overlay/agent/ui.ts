// Operate Azgaar's own interface (dialogs, side menu, buttons, fields) the way a person would, so that every
// feature the interface offers is reachable even when it has no dedicated command.
import { config } from "./config";
import { AgentError, type Params } from "./types";

type Scope = "dialogs" | "menu" | "page";
const SCOPES: Scope[] = ["dialogs", "menu", "page"];
const CONTROLS =
  "button, input, select, textarea, a[onclick], [onclick], .pseudoLink, summary, [role='button'], label[for], [data-tip]";

const refs = new Map<string, HTMLElement>();
let refCounter = 0;

const visible = (el: Element): boolean => {
  const rect = (el as HTMLElement).getBoundingClientRect();
  const style = getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && (rect.width > 0 || rect.height > 0);
};

const clean = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

function roots(scope: Scope): HTMLElement[] {
  if (scope === "dialogs") return [...document.querySelectorAll<HTMLElement>(".ui-dialog")].filter(visible);
  if (scope === "menu")
    return [...document.querySelectorAll<HTMLElement>("#optionsContainer, #options")].filter(visible);
  return [document.body];
}

function refOf(el: HTMLElement): string {
  for (const [ref, known] of refs) if (known === el) return ref;
  refCounter += 1;
  const ref = `r${refCounter}`;
  refs.set(ref, el);
  return ref;
}

const ownText = (el: Element): string =>
  clean(
    [...el.childNodes]
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent)
      .join(" ")
  );

function labelOf(el: HTMLElement): string {
  const input = el as HTMLInputElement;
  const own = clean(el.getAttribute("aria-label") ?? el.getAttribute("data-tip") ?? el.getAttribute("title"));
  const viaLabel = input.id ? clean(document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent) : "";
  const isField = el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA";
  const isControl = isField || ["BUTTON", "A", "SUMMARY", "LABEL"].includes(el.tagName);
  const text = isField ? "" : isControl ? clean(el.textContent) : ownText(el) || clean(el.textContent).slice(0, 40);
  return clean(text || viaLabel || own).slice(0, 90);
}

export interface ControlInfo {
  ref: string;
  id?: string;
  kind: string;
  label: string;
  tip?: string;
  value?: string | boolean;
  options?: { value: string; label: string }[];
  disabled?: boolean;
  hidden?: boolean;
}

function describe(el: HTMLElement): ControlInfo {
  const tag = el.tagName.toLowerCase();
  const input = el as HTMLInputElement;
  const info: ControlInfo = { ref: refOf(el), kind: tag === "input" ? `input:${input.type}` : tag, label: labelOf(el) };
  if (el.id) info.id = el.id;
  const tip = clean(el.getAttribute("data-tip") ?? el.getAttribute("title"));
  if (tip && tip !== info.label) info.tip = tip.slice(0, 140);
  if (tag === "input" && (input.type === "checkbox" || input.type === "radio")) info.value = input.checked;
  else if (tag === "input" || tag === "textarea") info.value = input.value;
  else if (tag === "select") {
    const select = el as HTMLSelectElement;
    info.value = select.value;
    info.options = [...select.options]
      .slice(0, config.uiOptionsMax)
      .map(o => ({ value: o.value, label: clean(o.textContent) }));
  }
  if ((el as HTMLButtonElement).disabled) info.disabled = true;
  if (!visible(el)) info.hidden = true;
  return info;
}

function inScope(scope: Scope, includeHidden = false): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const rootsToScan = includeHidden && scope === "page" ? [document.body] : roots(scope);
  for (const root of rootsToScan)
    for (const el of root.querySelectorAll<HTMLElement>(CONTROLS)) if (includeHidden || visible(el)) seen.add(el);
  return [...seen];
}

const scopeOf = (args: Params): Scope => {
  const scope = (args.scope ?? "dialogs") as Scope;
  if (!SCOPES.includes(scope)) throw new AgentError(`ui: scope must be one of ${SCOPES.join(", ")}`);
  return scope;
};

export function openDialogs(): { id: string; title: string; text: string }[] {
  return [...document.querySelectorAll<HTMLElement>(".ui-dialog")].filter(visible).map(d => {
    const content = d.querySelector<HTMLElement>(".ui-dialog-content");
    return {
      id: content?.id ?? "",
      title: clean(d.querySelector(".ui-dialog-title")?.textContent),
      text: clean(content?.innerText).slice(0, config.uiTextMax)
    };
  });
}

/** What is on screen to operate: open dialogs (with their text) and their controls, or the side menu, or everything. */
export function uiList(args: Params = {}): Record<string, unknown> {
  const scope = scopeOf(args);
  const query = typeof args.query === "string" ? args.query.toLowerCase() : "";
  const includeHidden = args.hidden === true;
  let controls = inScope(scope, includeHidden).map(describe);
  if (query)
    controls = controls.filter(c => `${c.id ?? ""} ${c.label} ${c.tip ?? ""} ${c.kind}`.toLowerCase().includes(query));
  const total = controls.length;
  const limit = typeof args.limit === "number" ? args.limit : config.listLimit;
  return { scope, dialogs: openDialogs(), total, controls: controls.slice(0, limit), truncated: total > limit };
}

function resolve(args: Params): HTMLElement {
  if (typeof args.ref === "string") {
    const el = refs.get(args.ref);
    if (!el?.isConnected)
      throw new AgentError(`ui: reference "${args.ref}" is out of date: call map_ui list/find again`);
    return el;
  }
  if (typeof args.id === "string") {
    const el = document.getElementById(args.id);
    if (!el) throw new AgentError(`ui: no element with id "${args.id}" (use map_ui find to look for it)`);
    return el;
  }
  if (typeof args.selector === "string") {
    let found: HTMLElement | null = null;
    try {
      const all = [...document.querySelectorAll<HTMLElement>(args.selector)];
      found = all.find(visible) ?? all[0] ?? null;
    } catch {
      throw new AgentError(`ui: invalid selector "${args.selector}"`);
    }
    if (!found) throw new AgentError(`ui: nothing matches selector "${args.selector}"`);
    return found;
  }
  if (typeof args.text === "string") {
    const wanted = args.text.toLowerCase();
    const scope = scopeOf({ scope: args.scope ?? "dialogs" });
    const everything = roots(scope)
      .flatMap(r => [...r.querySelectorAll<HTMLElement>("*")])
      .filter(visible);
    const controls = new Set(inScope(scope));
    // best match first: own text exactly, a control label exactly, then partial matches (shortest text = most specific)
    // [tier, text length]: lower is better
    const rank = (el: HTMLElement): [number, number] | null => {
      const own = ownText(el).toLowerCase();
      const label = labelOf(el).toLowerCase();
      if (own === wanted) return [0, 0];
      if (controls.has(el) && label === wanted) return [1, 0];
      if (own.includes(wanted)) return [2, own.length];
      if (controls.has(el) && label.includes(wanted)) return [3, label.length];
      return null;
    };
    const matches = everything
      .flatMap(el => {
        const r = rank(el);
        return r ? [{ el, r }] : [];
      })
      .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1]);
    if (!matches.length)
      throw new AgentError(
        `ui: nothing on screen (${scope}) says "${args.text}". Use map_ui list to see what is there`
      );
    return matches[0].el;
  }
  throw new AgentError("ui: say which element: ref, id, selector or text");
}

const fire = (el: Element, type: string): void => {
  el.dispatchEvent(new Event(type, { bubbles: true }));
};

export function uiClick(args: Params): Record<string, unknown> {
  const el = resolve(args);
  if ((el as HTMLButtonElement).disabled) throw new AgentError(`ui: "${labelOf(el) || el.id}" is disabled right now`);
  if (typeof el.click === "function") el.click();
  else el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return { clicked: describe(el), dialogs: openDialogs() };
}

export function uiSet(args: Params): Record<string, unknown> {
  const el = resolve(args);
  const value = args.value;
  if (value === undefined) throw new AgentError("ui set: give a value");
  const tag = el.tagName;
  if (tag === "INPUT" && ["checkbox", "radio"].includes((el as HTMLInputElement).type)) {
    (el as HTMLInputElement).checked = Boolean(value);
    fire(el, "input");
    fire(el, "change");
  } else if (tag === "INPUT" || tag === "TEXTAREA") {
    (el as HTMLInputElement).value = String(value);
    fire(el, "input");
    fire(el, "change");
  } else if (tag === "SELECT") {
    const select = el as HTMLSelectElement;
    const wanted = String(value).toLowerCase();
    const option =
      [...select.options].find(o => o.value.toLowerCase() === wanted) ??
      [...select.options].find(o => clean(o.textContent).toLowerCase() === wanted);
    if (!option)
      throw new AgentError(
        `ui set: "${value}" is not one of: ${[...select.options]
          .map(o => `${o.value} (${clean(o.textContent)})`)
          .slice(0, config.uiOptionsMax)
          .join("; ")}`
      );
    select.value = option.value;
    fire(el, "input");
    fire(el, "change");
  } else if (el.isContentEditable) {
    el.textContent = String(value);
    fire(el, "input");
    fire(el, "blur");
  } else
    throw new AgentError(`ui set: "${labelOf(el) || el.id}" is not a field (it is a ${tag.toLowerCase()}): use click`);
  return { set: describe(el), dialogs: openDialogs() };
}

export function uiGet(args: Params): Record<string, unknown> {
  return { control: describe(resolve(args)) };
}

/** Closes every open dialog (or the one with this content id). */
export function uiCloseDialogs(args: Params = {}): Record<string, unknown> {
  const only = typeof args.id === "string" ? `#${CSS.escape(args.id)}` : null;
  $(".dialog:visible").each(function (this: HTMLElement) {
    if (only && !this.matches(only)) return;
    try {
      $(this).dialog("close");
    } catch {
      // a dialog that is being torn down: nothing to close
    }
  });
  return { dialogs: openDialogs() };
}
