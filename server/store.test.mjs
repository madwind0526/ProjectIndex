import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_SETTINGS, normalizeSettings } from "./store.mjs";

test("normalizeSettings falls back to defaults for empty or invalid input", () => {
  const settings = normalizeSettings({ llmProvider: "bogus", comfyModel: "nope", roots: [], categories: ["  "] });
  assert.equal(settings.llmProvider, "none");
  assert.equal(settings.comfyModel, DEFAULT_SETTINGS.comfyModel);
  assert.deepEqual(settings.roots, DEFAULT_SETTINGS.roots);
  assert.deepEqual(settings.categories, DEFAULT_SETTINGS.categories);
});

test("normalizeSettings trims, de-duplicates and strips trailing slashes", () => {
  const settings = normalizeSettings({ llmProvider: "ollama", comfyUrl: "http://127.0.0.1:8190//", roots: ["C:\\a", " C:\\a ", "D:\\b"] });
  assert.equal(settings.llmProvider, "ollama");
  assert.equal(settings.comfyUrl, "http://127.0.0.1:8190");
  assert.deepEqual(settings.roots, ["C:\\a", "D:\\b"]);
});
