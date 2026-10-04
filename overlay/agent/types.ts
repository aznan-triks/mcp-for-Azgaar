/** Parameter description, used both for validation and for the tool listing shown to the AI. */
export interface ParamSpec {
  type: "number" | "integer" | "string" | "boolean" | "integers" | "points" | "path";
  description: string;
  required?: boolean;
  min?: number;
  max?: number;
  enum?: readonly string[];
}

export type ParamSpecs = Record<string, ParamSpec>;
export type Params = Record<string, unknown>;

export interface CommandResult {
  ok: boolean;
  message: string;
  changed?: number;
  skipped?: Record<string, number>;
  details?: Record<string, unknown>;
  warnings?: string[];
}

export interface Command {
  name: string;
  description: string;
  params: ParamSpecs;
  run(params: Params): Promise<CommandResult> | CommandResult;
}

export class AgentError extends Error {}
