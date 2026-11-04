import { AgentError, type Command, type CommandResult, type Params } from "../types";
import { validate } from "../validate";
import { annotateCommands } from "./annotate";
import { burgCommands } from "./burgs";
import { communityCommands } from "./communities";
import { diplomacyCommands } from "./diplomacy";
import { emblemCommands } from "./emblems";
import { featureCommands } from "./features";
import { labelCommands } from "./labels";
import { legendCommands } from "./legend";
import { loreNoteCommands } from "./lore-notes";
import { militaryCommands } from "./military";
import { namingCommands } from "./naming";
import { provinceCommands } from "./provinces";
import { stateCommands } from "./states";
import { styleCommands } from "./styles";
import { terrainCommands } from "./terrain";
import { territoryCommands } from "./territory";
import { zoneCommands } from "./zones";

/** The registry: adding a command = adding it to one of these lists. */
export const commands: Command[] = [
  ...loreNoteCommands,
  ...zoneCommands,
  ...diplomacyCommands,
  ...militaryCommands,
  ...territoryCommands,
  ...stateCommands,
  ...provinceCommands,
  ...communityCommands,
  ...terrainCommands,
  ...burgCommands,
  ...featureCommands,
  ...labelCommands,
  ...emblemCommands,
  ...legendCommands,
  ...annotateCommands,
  ...namingCommands,
  ...styleCommands
];

// Preserve names accepted by the concurrent PR without replacing main's published contract.
const legacyAliases: Record<string, Record<string, string>> = {
  setDiplomacy: { state: "stateId", to: "targetStateId", relation: "status" },
  addRegiment: { state: "stateId" },
  updateRegiment: { state: "stateId", regiment: "regimentId" },
  moveRegiment: { state: "stateId", regiment: "regimentId" },
  splitRegiment: { state: "stateId", regiment: "regimentId" },
  removeRegiment: { state: "stateId", regiment: "regimentId" },
  attachRegiment: {
    state: "stateId",
    regiment: "regimentId",
    to_id: "targetId",
    to_state: "targetStateId",
    to_regiment: "targetRegimentId"
  },
  // the camelCase spelling the task plans use for the published as_provinces option
  mergeStates: { asProvinces: "as_provinces" }
};

export function describeCommands(): { name: string; description: string; params: Command["params"] }[] {
  return commands.map(({ name, description, params }) => ({
    name,
    description,
    params: {
      ...params,
      ...Object.fromEntries(
        Object.entries(legacyAliases[name] ?? {}).map(([alias, canonical]) => [
          alias,
          {
            ...params[canonical],
            required: false,
            description: `Legacy alias for ${canonical}; do not supply both names`
          }
        ])
      )
    }
  }));
}

export async function runCommand(name: string, params: Params): Promise<CommandResult> {
  const command = commands.find(c => c.name === name);
  if (!command) throw new AgentError(`Unknown command "${name}". Available: ${commands.map(c => c.name).join(", ")}`);
  const normalized = { ...params };
  for (const [alias, canonical] of Object.entries(legacyAliases[name] ?? {})) {
    if (Object.hasOwn(normalized, alias)) {
      if (Object.hasOwn(normalized, canonical))
        throw new AgentError(`${name}: give ${canonical} OR ${alias}, not both`);
      normalized[canonical] = normalized[alias];
      delete normalized[alias];
    }
  }
  validate(command.params, normalized, name);
  return await command.run(normalized);
}
