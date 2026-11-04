import { ENTITY_TYPES, type EntityRef, MapEntities } from "@/components/map-entities";
import { Lore } from "@/generators/lore";
import { Notes } from "@/generators/notes";
import { isSafeHtml } from "@/utils/validationUtils";
import { AgentError, type Command, type CommandResult, type Params } from "../types";

// The strip rules mirror isSafeHtml's allowlists: anything still unsafe afterwards is rejected, never stored.
const ALLOWED_TAGS = new Set(
  "p div br hr span strong b em i u s strike a img ol ul li blockquote code h1 h2 h3 h4 h5 h6 sub sup table tbody tr td".split(
    " "
  )
);
const ALLOWED_ATTRIBUTES = new Set(["href", "src", "alt", "title", "style", "colspan", "rowspan"]);

/** Strip every element outside the notes-editor subset and every dangerous attribute (event handlers, JavaScript URLs, style escapes). The result passes upstream `isSafeHtml` before it is ever stored. Exported for the tests. */
export function sanitizeNoteHtml(raw: string): string {
  const template = document.createElement("template");
  template.innerHTML = String(raw);
  for (const element of template.content.querySelectorAll("*")) {
    if (!ALLOWED_TAGS.has(element.localName)) {
      element.remove(); // removes the subtree: <script>…</script>, <iframe>, <object>, <embed>, forms…
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (!ALLOWED_ATTRIBUTES.has(name)) {
        element.removeAttribute(attribute.name); // covers every on* event handler
        continue;
      }
      if (name === "style" && /url\s*\(|expression\s*\(|@import/i.test(value)) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === "href" || name === "src") {
        // a scheme is optional (relative link); when present it must be an allowed one
        const compact = [...value].filter(character => character.charCodeAt(0) > 32).join("");
        const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(compact);
        const allowed =
          name === "src"
            ? /^(?:https?:|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(compact)
            : /^(?:https?|mailto):/i.test(compact);
        if (hasScheme && !allowed) element.removeAttribute(attribute.name); // javascript: and friends
      }
    }
  }
  return template.innerHTML;
}

const NOTE_TYPES = [...ENTITY_TYPES] as string[];

/** A note is addressed by its key `id` ("type:id", regiments "type:stateId-regimentId", as map_list kind=notes shows) or by `entity_type` + `entity_id` (+ `entity_sub`). */
function resolveNoteRef(p: Params, context: string): { ref: EntityRef; key: string } {
  const [id, type, entityId, sub] = [
    p.id as string | undefined,
    p.entity_type as string | undefined,
    p.entity_id as number | undefined,
    p.entity_sub as number | undefined
  ];
  let ref: EntityRef | undefined;
  if (id !== undefined) {
    ref = MapEntities.parseKey(id);
    if (!ref)
      throw new AgentError(`${context}: "id" must look like "state:3" (a key from map_list kind=notes), got "${id}"`);
  } else {
    if (type === undefined || entityId === undefined)
      throw new AgentError(`${context}: give "id" (a map_list kind=notes key) or both "entity_type" and "entity_id"`);
    ref =
      sub === undefined
        ? { type: type as EntityRef["type"], id: entityId }
        : { type: type as EntityRef["type"], id: entityId, sub };
    if (type === "regiment" && sub === undefined)
      throw new AgentError(
        `${context}: a regiment needs "entity_sub" (its own id inside state entity_id, see map_list kind=military)`
      );
  }
  if (!MapEntities.get(ref)) throw new AgentError(`${context}: entity ${MapEntities.key(ref)} does not exist`);
  return { ref, key: MapEntities.key(ref) };
}

function sanitizeFor(p: Params, context: string): { html: string; wasUnsafe: boolean } {
  const raw = p.html as string;
  const html = sanitizeNoteHtml(raw);
  if (!html.trim())
    throw new AgentError(`${context}: nothing storable remains of the note (all markup was unsafe or empty)`);
  // belt and braces: the sanitizer mirrors these rules, so this never fails; if it ever does, refuse rather than store
  if (!isSafeHtml(html)) throw new AgentError(`${context}: the sanitized note is still unsafe and was refused`);
  return { html, wasUnsafe: html !== raw };
}

const refParams = (): Command["params"] => ({
  id: { type: "string", description: 'Note key from map_list kind=notes, e.g. "state:3" (regiment: "regiment:3-2")' },
  entity_type: { type: "string", enum: NOTE_TYPES, description: `Entity type: ${NOTE_TYPES.join(", ")}` },
  entity_id: { type: "integer", min: 0, description: "Entity id inside its type" },
  entity_sub: { type: "integer", min: 0, description: "Only for regiments: the regiment's own id inside its state" },
  html: {
    type: "string",
    required: true,
    description:
      "Note HTML from the notes-editor subset; scripts, iframes, event handlers and javascript: URLs are stripped"
  }
});

const setNote: Command = {
  name: "setNote",
  description:
    "Write or replace the rich-text note of an entity (state, province, burg, marker, river, route, zone, culture, religion, biome, good, regiment…). Unsafe markup is stripped before storing, never executed. Read notes with map_list kind=notes.",
  params: refParams(),
  run(p: Params): CommandResult {
    const { key } = resolveNoteRef(p, "setNote");
    const { html, wasUnsafe } = sanitizeFor(p, "setNote");
    Notes.write(key, html);
    return {
      ok: true,
      message: `Note of ${key} written (${html.length} characters).`,
      changed: 1,
      details: { key, characters: html.length, sanitized: wasUnsafe },
      ...(wasUnsafe
        ? { warnings: ["Unsafe markup (scripts, event handlers or JavaScript URLs) was stripped from the note."] }
        : {})
    };
  }
};

const appendNote: Command = {
  name: "appendNote",
  description: "Append HTML to an entity's existing note (same safety rules as setNote).",
  params: refParams(),
  run(p: Params): CommandResult {
    const { ref, key } = resolveNoteRef(p, "appendNote");
    const { html, wasUnsafe } = sanitizeFor(p, "appendNote");
    if (!Notes.append(ref, html)) throw new AgentError(`appendNote: entity ${key} does not exist`);
    const total = Notes.get(ref)?.length ?? 0;
    return {
      ok: true,
      message: `Note of ${key} appended (+${html.length} characters, ${total} total).`,
      changed: 1,
      details: { key, characters: total, appended: html.length, sanitized: wasUnsafe },
      ...(wasUnsafe
        ? { warnings: ["Unsafe markup (scripts, event handlers or JavaScript URLs) was stripped from the note."] }
        : {})
    };
  }
};

const removeNote: Command = {
  name: "removeNote",
  description: "Delete an entity's note entirely (the entity itself is untouched).",
  params: {
    id: { type: "string", description: 'Note key from map_list kind=notes, e.g. "state:3" (regiment: "regiment:3-2")' },
    entity_type: { type: "string", enum: NOTE_TYPES, description: `Entity type: ${NOTE_TYPES.join(", ")}` },
    entity_id: { type: "integer", min: 0, description: "Entity id inside its type" },
    entity_sub: { type: "integer", min: 0, description: "Only for regiments: the regiment's own id inside its state" }
  },
  run(p: Params): CommandResult {
    const { ref, key } = resolveNoteRef(p, "removeNote");
    const had = Notes.get(ref) !== undefined;
    Notes.set(ref, "");
    return {
      ok: true,
      message: had ? `Note of ${key} deleted.` : `Entity ${key} had no note (nothing to delete).`,
      changed: had ? 1 : 0,
      details: { key, had }
    };
  }
};

const setMapLore: Command = {
  name: "setMapLore",
  description:
    "Set the world's lore: its name (downloaded files take it), the current year and era of its calendar (history and battle reports are dated by them) and the author's free description. At least one field must be given; read them with map_summary lore.",
  params: {
    name: { type: "string", description: "Map name" },
    year: { type: "integer", description: "Current year, may be negative" },
    era: { type: "string", description: 'Era name, such as "Winter Era"' },
    era_short: { type: "string", description: 'Era short form, such as "WE" (abbreviated from the era if omitted)' },
    description: {
      type: "string",
      allowEmpty: true,
      description: "Author's description of the world; pass an empty string to clear it"
    }
  },
  run(p: Params): CommandResult {
    const [name, year, era, eraShort, description] = [
      p.name as string | undefined,
      p.year as number | undefined,
      p.era as string | undefined,
      p.era_short as string | undefined,
      p.description as string | undefined
    ];
    if ([name, year, era, eraShort, description].every(field => field === undefined))
      throw new AgentError("setMapLore: give at least one of name, year, era, era_short or description");
    const changes: string[] = [];
    if (name !== undefined) {
      Lore.rename(name);
      changes.push("name");
    }
    if (year !== undefined) {
      Lore.setYear(year);
      changes.push("year");
    }
    if (era !== undefined) {
      Lore.setEra(era, eraShort);
      changes.push(eraShort !== undefined ? "era and era_short" : "era");
    } else if (eraShort !== undefined) {
      const { calendar } = options.map.lore;
      Lore.setEra(calendar.era, eraShort); // the era is validated and kept; only the short form changes
      changes.push("era_short");
    }
    if (description !== undefined) {
      Lore.setDescription(description);
      changes.push(description ? "description" : "description cleared");
    }
    const { lore } = options.map;
    return {
      ok: true,
      message: `Lore updated (${changes.join(", ")}): ${lore.name}, year ${lore.calendar.year} ${lore.calendar.eraShort}.`,
      changed: changes.length,
      details: {
        changed: changes,
        name: lore.name,
        year: lore.calendar.year,
        era: lore.calendar.era,
        eraShort: lore.calendar.eraShort,
        description: lore.description
      }
    };
  }
};

export const loreNoteCommands: Command[] = [setNote, appendNote, removeNote, setMapLore];
