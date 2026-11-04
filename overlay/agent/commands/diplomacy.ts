import type { Command, CommandResult } from "../types";

const done = (message: string): CommandResult => ({ ok: true, message, changed: 1 });

export const diplomacyCommands: Command[] = [
  {
    name: "setDiplomacy",
    description: "Set a bilateral relation, its inverse (Vassal/Suzerain), and record the change in the chronicle.",
    params: {
      stateId: { type: "integer", required: true, min: 1, description: "Subject state" },
      targetStateId: { type: "integer", required: true, min: 1, description: "Other state" },
      status: {
        type: "string",
        required: true,
        description: "Relation from subject to target",
        enum: ["Ally", "Friendly", "Neutral", "Suspicion", "Enemy", "Unknown", "Rival", "Vassal", "Suzerain"]
      }
    },
    run(p) {
      States.setRelation(p.stateId as number, p.targetStateId as number, p.status as string);
      return done("Diplomatic relation updated");
    }
  },
  {
    name: "resetDiplomacy",
    description: "Regenerate all diplomatic relations and their chronicle using Azgaar's generator.",
    params: {},
    run() {
      States.generateDiplomacy();
      return done("Diplomacy regenerated");
    }
  },
  {
    name: "addChronicleEvent",
    description: "Append an escaped chronicle event. Newlines in text separate its paragraphs.",
    params: {
      title: { type: "string", required: true, description: "Event title" },
      text: { type: "string", required: true, description: "Event paragraphs, separated by newlines" }
    },
    run(p) {
      States.setChronicleEntry(-1, [p.title as string, ...(p.text as string).split("\n")]);
      return done("Chronicle event added");
    }
  },
  {
    name: "clearChronicle",
    description: "Clear the historical chronicle without changing bilateral relations.",
    params: {},
    run() {
      pack.states[0].diplomacy = [];
      return done("Chronicle cleared");
    }
  }
];
