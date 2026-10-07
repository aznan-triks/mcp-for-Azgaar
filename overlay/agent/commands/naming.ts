import { AgentError, type Command, type CommandResult, type Params } from "../types";

const KINDS = ["state", "province", "burg", "culture", "religion", "river"] as const;

const rename: Command = {
  name: "rename",
  description:
    "Rename a state, province, burg, culture, religion or river. For states and provinces `full_name` is the long form shown on the map (defaults to `name`).",
  params: {
    kind: { type: "string", required: true, enum: KINDS, description: "What to rename" },
    id: { type: "integer", required: true, min: 1, description: "Entity id" },
    name: { type: "string", required: true, description: "New (short) name" },
    full_name: { type: "string", description: "Long name, e.g. 'Kingdom of Gazd' (states and provinces only)" }
  },
  run(p: Params): CommandResult {
    const [kind, id, name] = [p.kind as (typeof KINDS)[number], p.id as number, p.name as string];
    // rivers are looked up by their id: the list is not indexed by it
    const entity = (
      kind === "river"
        ? pack.rivers.find(r => r.i === id)
        : {
            state: pack.states,
            province: pack.provinces,
            burg: pack.burgs,
            culture: pack.cultures,
            religion: pack.religions
          }[kind][id]
    ) as { name?: string; fullName?: string; removed?: boolean; label?: { text?: string } } | undefined;
    if (!entity || entity.removed) throw new AgentError(`rename: ${kind} ${id} does not exist`);
    if (p.full_name !== undefined && kind !== "state" && kind !== "province")
      throw new AgentError("rename: full_name only applies to states and provinces");
    const old = entity.fullName ?? entity.name;
    entity.name = name;
    if (kind === "state" || kind === "province") {
      entity.fullName = (p.full_name as string | undefined) ?? name;
      if (entity.label?.text) delete entity.label.text;
    }
    if (kind === "river" && entity.label?.text) delete entity.label.text; // the river label follows its name again
    if (kind === "burg") entity.label = { ...entity.label, text: name };
    if (kind === "state" || kind === "province" || kind === "burg" || kind === "river") Layers.draw("labels");
    if (kind === "province") Layers.draw("provinces");
    return {
      ok: true,
      message: `${kind} ${id} renamed`,
      changed: 1,
      details: { from: old, to: entity.fullName ?? name }
    };
  }
};

const setStateColor: Command = {
  name: "setStateColor",
  description: "Change the colour of a state (hex like #aa3355).",
  params: {
    state: { type: "integer", required: true, min: 1, description: "State id" },
    color: { type: "string", required: true, description: "Hex colour, e.g. #aa3355" } // const-ok: format example shown to the AI
  },
  run(p: Params): CommandResult {
    const state = pack.states[p.state as number];
    if (!state || state.removed) throw new AgentError(`setStateColor: state ${p.state} does not exist`);
    if (!/^#[0-9a-fA-F]{6}$/.test(p.color as string))
      throw new AgentError("setStateColor: color must look like #aa3355"); // const-ok: format example
    const old = state.color;
    state.color = p.color as string;
    Layers.draw("states");
    Layers.draw("military");
    return { ok: true, message: `State ${state.i} recoloured`, changed: 1, details: { from: old, to: state.color } };
  }
};

export const namingCommands: Command[] = [rename, setStateColor];
