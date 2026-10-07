import { AgentError, type Command, type CommandResult, type Params } from "../types";
import { validate } from "../validate";
import { annotateCommands } from "./annotate";
import { burgCommands } from "./burgs";
import { communityCommands } from "./communities";
import { emblemCommands } from "./emblems";
import { featureCommands } from "./features";
import { labelCommands } from "./labels";
import { legendCommands } from "./legend";
import { namingCommands } from "./naming";
import { provinceCommands } from "./provinces";
import { stateCommands } from "./states";
import { terrainCommands } from "./terrain";
import { territoryCommands } from "./territory";

/** The registry: adding a command = adding it to one of these lists. */
export const commands: Command[] = [
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
  ...namingCommands
];

export function describeCommands(): { name: string; description: string; params: Command["params"] }[] {
  return commands.map(({ name, description, params }) => ({ name, description, params }));
}

export async function runCommand(name: string, params: Params): Promise<CommandResult> {
  const command = commands.find(c => c.name === name);
  if (!command) throw new AgentError(`Unknown command "${name}". Available: ${commands.map(c => c.name).join(", ")}`);
  validate(command.params, params, name);
  return await command.run(params);
}
