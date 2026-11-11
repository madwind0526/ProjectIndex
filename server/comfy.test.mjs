import assert from "node:assert/strict";
import { test } from "node:test";

import { startComfyUi } from "./comfy.mjs";

// Regression: comfy.mjs once had no imports, so reaching spawn/path/existsSync threw a ReferenceError.
test("startComfyUi refuses a remote endpoint without starting anything", async () => {
  assert.equal(await startComfyUi({ endpoint: "http://example.com:8190", enginePath: "C:\\nope" }), false);
});

test("startComfyUi returns false for a local endpoint whose engine folder has no python", async () => {
  const result = await startComfyUi({ endpoint: "http://127.0.0.1:8190", enginePath: "C:\\definitely-missing", fileExists: () => false });
  assert.equal(result, false);
});
