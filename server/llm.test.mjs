import assert from "node:assert/strict";
import { test } from "node:test";

import { parseJsonAnswer } from "./llm.mjs";

test("parseJsonAnswer finds the object inside a code fence and chatter", () => {
  const answer = 'Sure!\n```json\n{"summary":"a","category":"음악"}\n```\nDone.';
  assert.deepEqual(parseJsonAnswer(answer), { summary: "a", category: "음악" });
});

test("parseJsonAnswer throws when there is no JSON object", () => {
  assert.throws(() => parseJsonAnswer("no json here"), /JSON/);
});
