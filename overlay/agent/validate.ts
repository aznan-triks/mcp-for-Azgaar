import { AgentError, type ParamSpecs, type Params } from "./types";

/** Checks `params` against `specs`; throws AgentError with a message the AI can act on. */
export function validate(specs: ParamSpecs, params: Params, context: string): void {
  for (const key of Object.keys(params)) {
    if (!(key in specs))
      throw new AgentError(`${context}: unknown parameter "${key}". Allowed: ${Object.keys(specs).join(", ")}`);
  }
  for (const [key, spec] of Object.entries(specs)) {
    const value = params[key];
    if (value === undefined || value === null) {
      if (spec.required) throw new AgentError(`${context}: missing required parameter "${key}" (${spec.description})`);
      continue;
    }
    check(key, spec, value, context);
  }
}

function check(key: string, spec: ParamSpecs[string], value: unknown, context: string): void {
  function fail(why: string): never {
    throw new AgentError(`${context}: parameter "${key}" ${why}`);
  }
  switch (spec.type) {
    case "number":
    case "integer": {
      if (typeof value !== "number" || !Number.isFinite(value)) fail("must be a number");
      if (spec.type === "integer" && !Number.isInteger(value)) fail("must be an integer");
      if (spec.min !== undefined && value < spec.min) fail(`must be >= ${spec.min}`);
      if (spec.max !== undefined && value > spec.max) fail(`must be <= ${spec.max}`);
      return;
    }
    case "string": {
      if (typeof value !== "string" || (!value.length && !spec.allowEmpty))
        fail(spec.allowEmpty ? "must be a string" : "must be a non-empty string");
      if (spec.enum && !spec.enum.includes(value)) fail(`must be one of: ${spec.enum.join(", ")}`);
      return;
    }
    case "boolean": {
      if (typeof value !== "boolean") fail("must be true or false");
      return;
    }
    case "integers": {
      if (!Array.isArray(value) || !value.every(v => Number.isInteger(v))) fail("must be an array of integers");
      return;
    }
    case "units": {
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        Object.values(value).some(count => !Number.isSafeInteger(count) || (count as number) < 0)
      )
        fail("must be an object of unit names and non-negative safe integer counts");
      return;
    }
    case "points": {
      if (!isPointList(value, 3)) fail("must be an array of at least 3 [x, y] points");
      return;
    }
    case "path": {
      if (!isPointList(value, 2)) fail("must be an array of at least 2 [x, y] points");
      return;
    }
    case "record": {
      const entries = isRecord(value) ? Object.entries(value) : null;
      if (!entries) fail("must be an object of names and numbers");
      else if (entries.some(([, v]) => typeof v !== "number" || !Number.isFinite(v)))
        fail("must hold only numbers (counts are whole numbers, checked again by the command)");
      return;
    }
    case "scalar": {
      // a plain style value: text, a number or true/false; null is treated as absent above (unsets an attr)
      if (
        typeof value !== "string" &&
        typeof value !== "boolean" &&
        !(typeof value === "number" && Number.isFinite(value))
      )
        fail("must be text, a number or true/false (null unsets a value)");
      return;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPointList(value: unknown, minLength: number): boolean {
  return (
    Array.isArray(value) &&
    value.length >= minLength &&
    value.every(p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === "number" && Number.isFinite(n)))
  );
}
