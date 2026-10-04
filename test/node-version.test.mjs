import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSupportedNode, unsupportedNodeMessage } from "../scripts/node-version.mjs";

describe("Node version gate", () => {
  it("accepts 22.18+ and newer majors", () => {
    for (const v of ["22.18.0", "22.22.2", "23.0.0", "24.0.0", "25.1.3"]) assert.equal(isSupportedNode(v), true, v);
  });
  it("refuses older versions", () => {
    for (const v of ["18.20.4", "20.11.0", "22.17.9", "22.0.0", "21.7.3"]) assert.equal(isSupportedNode(v), false, v);
  });
  it("says what to install", () => {
    assert.match(unsupportedNodeMessage("20.11.0"), /Node 20\.11\.0 is too old.*22\.18.*nodejs\.org.*restart your AI client/);
  });
});
