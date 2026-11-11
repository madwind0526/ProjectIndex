import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanRemote, githubRepoOf, slug } from "./scan.mjs";

test("slug lowercases and collapses separators", () => {
  assert.equal(slug("Rolling Block Strike"), "rolling-block-strike");
  assert.equal(slug("YuE2-Studio_1.1.0"), "yue2-studio-1-1-0");
});

test("cleanRemote strips credentials and the .git suffix", () => {
  assert.equal(cleanRemote("https://ghp_secret@github.com/me/repo.git"), "https://github.com/me/repo");
  assert.equal(cleanRemote("https://github.com/me/repo"), "https://github.com/me/repo");
});

test("githubRepoOf reads owner and repo from https and ssh remotes", () => {
  assert.deepEqual(githubRepoOf("https://github.com/me/repo"), { owner: "me", repo: "repo" });
  assert.deepEqual(githubRepoOf("git@github.com:me/repo"), { owner: "me", repo: "repo" });
  assert.equal(githubRepoOf("https://example.com/me/repo"), null);
});
